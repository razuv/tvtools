import {
  draw as createDraw,
  effect,
  frame,
  geometry as createGeometry,
  init,
  sampler,
  surface,
  target,
  type Draw,
  type Effect,
  type Geometry,
  type Gpu,
  type Target,
} from "vgpu";
import type { Texture } from "vgpu/core";
import type * as THREE from "three";
import { bakeEnvironment } from "../vgpu-transmission/scene";
import blurShader from "../vgpu-transmission/blur.wgsl";
import presentShader from "../vgpu-transmission/present.wgsl";
import backgroundShader from "./vgpu-transmission-background.wgsl";
import glassShader from "./vgpu-transmission-glass.wgsl";

const HDR_FORMAT: GPUTextureFormat = "rgba16float";
const PYRAMID_LEVELS = 8;
const ENV_SIZE: readonly [number, number] = [2048, 1024];

type BlurLevel = { horizontal: Target; vertical: Target; horizontalPass: Effect; verticalPass: Effect };
type Targets = { hdr: Target; pyramid: Texture; levels: BlurLevel[] };

export type TransmissionOptions = {
  color: string;
  ior: number;
  roughness: number;
  transparency: number;
  reflection: number;
  frost: number;
  rayAngle: number;
  rayStrength: number;
  dispersion: number;
  background: THREE.Scene["background"];
};

function destroyTargets(targets: Targets | null): void {
  if (!targets) return;
  for (let index = targets.levels.length - 1; index >= 0; index--) {
    (targets.levels[index].vertical as { destroy?: () => void }).destroy?.();
    (targets.levels[index].horizontal as { destroy?: () => void }).destroy?.();
  }
  targets.pyramid.destroy();
  (targets.hdr as { destroy?: () => void }).destroy?.();
}

function copyTextureLevel(gpu: Gpu, source: Target, destination: Texture, level: number): void {
  const encoder = gpu.gpu.createCommandEncoder();
  encoder.copyTextureToTexture(
    { texture: source.color.gpu },
    { texture: destination.gpu, mipLevel: level },
    [source.size[0], source.size[1], 1],
  );
  gpu.gpu.queue.submit([encoder.finish()]);
}

function hexToAbsorption(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const channel = (offset: number) => Number.parseInt(clean.slice(offset, offset + 2), 16) / 255;
  return [1 - channel(0), 1 - channel(2), 1 - channel(4)];
}

export async function createVgpuTransmissionLayer(_source: HTMLCanvasElement, outputCanvas: HTMLCanvasElement) {
  const gpu = await init();
  const unsubscribeError = gpu.onError((error) => console.warn("VGPU transmission GPU warning", error));
  const output = surface(gpu, outputCanvas, { dpr: [1, 2] });
  const sceneSampler = sampler(gpu, {
    minFilter: "linear",
    magFilter: "linear",
    mipmapFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });
  const envSampler = sampler(gpu, {
    minFilter: "linear",
    magFilter: "linear",
    mipmapFilter: "linear",
    addressModeU: "repeat",
    addressModeV: "clamp-to-edge",
  });
  const env = await bakeEnvironment(gpu, envSampler);
  const stagingCanvas=document.createElement("canvas");
  const stagingContext=stagingCanvas.getContext("2d",{alpha:false});
  if(!stagingContext)throw new Error("Could not create transmission background canvas.");
  const sourceTexture = gpu.device.createTexture({
    label: "playtools-transmission-source",
    size: [...output.size],
    format: "rgba8unorm",
    usage: ["copy_dst", "texture_binding"],
  });
  const background = createDraw(gpu, {shader:backgroundShader,vertices:3,depth:{write:false,compare:"always"},set:{source_tex:sourceTexture,source_samp:sceneSampler}});
  const present = effect(gpu, presentShader);
  let meshGeometry: Geometry | null = null;
  let glass: Draw | null = null;
  let glassReady = false;
  let disposed = false;
  let hasFrame = false;
  let uploadedBackground:unknown=null;
  let uploadedBackgroundVersion=-1;
  let uploadedWidth=0;
  let uploadedHeight=0;
  let targets: Targets | null = null;

  const createTargets = (size: readonly [number, number]): Targets => {
    const full: [number, number] = [Math.max(1, Math.floor(size[0])), Math.max(1, Math.floor(size[1]))];
    const levelCount = Math.max(1, Math.min(PYRAMID_LEVELS, Math.floor(Math.log2(Math.max(...full))) + 1));
    const hdr = target(gpu, { size: full, format: HDR_FORMAT, depth: true });
    const pyramid = gpu.device.createTexture({
      label: "playtools-transmission-pyramid",
      size: full,
      format: HDR_FORMAT,
      mipLevelCount: levelCount,
      usage: ["texture_binding", "copy_dst"],
    });
    const levels: BlurLevel[] = [];
    for (let level = 1; level < levelCount; level++) {
      const levelSize: [number, number] = [Math.max(1, full[0] >> level), Math.max(1, full[1] >> level)];
      const horizontal = target(gpu, { size: levelSize, format: HDR_FORMAT });
      const vertical = target(gpu, { size: levelSize, format: HDR_FORMAT });
      const horizontalPass = effect(gpu, blurShader);
      const verticalPass = effect(gpu, blurShader);
      levels.push({ horizontal, vertical, horizontalPass, verticalPass });
    }
    return { hdr, pyramid, levels };
  };

  const bindTargets = async () => {
    if (!targets) return;
    background.set({ source_tex: sourceTexture, source_samp: sceneSampler });
    present.set({ color_tex: targets.hdr, color_samp: sceneSampler });
    glass?.set({ scene_tex: targets.pyramid, scene_samp: sceneSampler, env_tex: env, env_samp: envSampler });
    for (let index = 0; index < targets.levels.length; index++) {
      const level = targets.levels[index];
      const previous = index === 0 ? targets.hdr : targets.levels[index - 1].vertical;
      const texel: [number, number] = [1 / level.vertical.size[0], 1 / level.vertical.size[1]];
      level.horizontalPass.set({ src: previous, src_samp: sceneSampler, blur: { texel, direction: [1, 0], radius: 1.15, equirect_compensation: 0 } });
      level.verticalPass.set({ src: level.horizontal, src_samp: sceneSampler, blur: { texel, direction: [0, 1], radius: 1.15, equirect_compensation: 0 } });
    }
    await Promise.all([
      background.compile(targets.hdr),
      present.compile({ colors: [output.format] }),
      ...(glass ? [glass.compile(targets.hdr)] : []),
      ...targets.levels.flatMap((level) => [level.horizontalPass.compile(level.horizontal), level.verticalPass.compile(level.vertical)]),
    ]);
    glassReady = Boolean(glass);
  };

  targets = createTargets(output.size);
  stagingCanvas.width=output.size[0];
  stagingCanvas.height=output.size[1];
  await bindTargets();

  const replaceTargets = () => {
    if (disposed) return;
    const previous = targets;
    targets = createTargets(output.size);
    sourceTexture.resize([...output.size]);
    stagingCanvas.width=output.size[0];
    stagingCanvas.height=output.size[1];
    uploadedWidth=0;
    uploadedHeight=0;
    glassReady = false;
    void bindTargets().then(() => destroyTargets(previous)).catch((error) => console.warn("VGPU transmission resize failed", error));
  };
  const unsubscribeResize = output.onResize(replaceTargets);

  return {
    setGeometry(sourceGeometry: THREE.BufferGeometry) {
      glassReady = false;
      glass = null;
      meshGeometry?.destroy();
      const positions = sourceGeometry.getAttribute("position");
      const normals = sourceGeometry.getAttribute("normal");
      if (!positions || !normals) return;
      const positionData = new Float32Array(positions.array as ArrayLike<number>);
      const normalData = new Float32Array(normals.array as ArrayLike<number>);
      meshGeometry = createGeometry(gpu, {
        label: "playtools-transmission-shape",
        buffers: [
          { data: positionData, attributes: { position: "float32x3" } },
          { data: normalData, attributes: { normal: "float32x3" } },
        ],
        vertexCount: positions.count,
      });
      glass = createDraw(gpu, { shader: glassShader, geometry: meshGeometry, cull: "back" });
      if (targets) {
        glass.set({ scene_tex: targets.pyramid, scene_samp: sceneSampler, env_tex: env, env_samp: envSampler });
        void glass.compile(targets.hdr).then(() => { if (!disposed) glassReady = true; }).catch((error) => console.warn("VGPU transmission pipeline failed", error));
      }
    },
    draw(camera: THREE.PerspectiveCamera, model: THREE.Group, options: TransmissionOptions) {
      if (disposed || !targets || !glass || !glassReady) return hasFrame;
      const currentTargets=targets;
      const currentGlass=glass;
      // THREE.WebGLRenderer builds an OpenGL [-1, 1] clip-space projection;
      // WebGPU clips Z to [0, 1]. Convert the matrix before sending it to WGSL.
      const clipToWebGpu=camera.projectionMatrix.clone().identity().set(
        1,0,0,0,
        0,1,0,0,
        0,0,.5,.5,
        0,0,0,1,
      );
      const viewProjection = clipToWebGpu.multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
      const right = new Float32Array(3);
      const up = new Float32Array(3);
      right.set([camera.matrixWorld.elements[0], camera.matrixWorld.elements[1], camera.matrixWorld.elements[2]]);
      up.set([camera.matrixWorld.elements[4], camera.matrixWorld.elements[5], camera.matrixWorld.elements[6]]);
      model.updateMatrixWorld(true);
      const effectiveRoughness = Math.max(0.004, options.roughness * 0.2 + options.frost * 0.82);
      const absorption = hexToAbsorption(options.color);
      // Use a subtle dispersion by default, controllable via options.dispersion (0-1)
      const dispersion = Math.max(0, Math.min(1, options.dispersion ?? 0.35));
      const dispersionSpread = 0.01 + dispersion * 0.08;

      try {
        const backgroundValue=options.background as unknown as {isColor?:boolean;getStyle?:()=>string;isTexture?:boolean;image?:CanvasImageSource};
        const backgroundVersion=(backgroundValue as {version?:number}|null)?.version??0;
        const backgroundChanged=options.background!==uploadedBackground||backgroundVersion!==uploadedBackgroundVersion||uploadedWidth!==stagingCanvas.width||uploadedHeight!==stagingCanvas.height;
        if(backgroundChanged){
          stagingContext.fillStyle=backgroundValue?.isColor&&backgroundValue.getStyle?backgroundValue.getStyle():"#050505";
          stagingContext.fillRect(0,0,stagingCanvas.width,stagingCanvas.height);
          if(backgroundValue?.isTexture&&backgroundValue.image){
            try{stagingContext.drawImage(backgroundValue.image,0,0,stagingCanvas.width,stagingCanvas.height);}catch{/* Texture image is not decoded yet; retain the neutral background for this frame. */}
          }
          const pixels=stagingContext.getImageData(0,0,stagingCanvas.width,stagingCanvas.height);
          gpu.device.gpu.queue.writeTexture(
            {texture:sourceTexture.gpu},
            pixels.data,
            {bytesPerRow:stagingCanvas.width*4,rowsPerImage:stagingCanvas.height},
            {width:stagingCanvas.width,height:stagingCanvas.height},
          );
          uploadedBackground=options.background;
          uploadedBackgroundVersion=backgroundVersion;
          uploadedWidth=stagingCanvas.width;
          uploadedHeight=stagingCanvas.height;
        }

        currentGlass.set({
          glass: {
            view_projection: new Float32Array(viewProjection.elements),
            model: new Float32Array(model.matrixWorld.elements),
            camera_position: [camera.position.x, camera.position.y, camera.position.z],
            camera_right: [...right],
            camera_up: [...up],
            ior: options.ior,
            roughness: effectiveRoughness,
            thickness: 0.45 + options.rayStrength * 1.25,
            dispersion: dispersion,
            absorption,
            scene_levels: currentTargets.levels.length + 1,
            env_size: ENV_SIZE,
            texel_angle: (2 * Math.PI) / ENV_SIZE[0],
            dispersion_spread: dispersionSpread,
            reflection_strength: options.reflection,
            transparency: options.transparency,
            ray_angle: options.rayAngle,
            ray_strength: options.rayStrength,
            refraction_mode: 1.0,
            double_amount: 1.0,
          },
        });

        frame(gpu, (current) => current.pass({ target: currentTargets.hdr, clear: [0, 0, 0, 0] }, (pass) => pass.draw(background)));
        copyTextureLevel(gpu, currentTargets.hdr, currentTargets.pyramid, 0);
        for (let index = 0; index < currentTargets.levels.length; index++) {
          const level = currentTargets.levels[index];
          frame(gpu, (current) => current.pass({ target: level.horizontal }, (pass) => pass.draw(level.horizontalPass)));
          frame(gpu, (current) => current.pass({ target: level.vertical }, (pass) => pass.draw(level.verticalPass)));
          copyTextureLevel(gpu, level.vertical, currentTargets.pyramid, index + 1);
        }
        frame(gpu, (current) => {
          current.pass({ target: currentTargets.hdr, clear: false }, (pass) => pass.draw(currentGlass));
          current.pass({ target: output }, (pass) => pass.draw(present));
        });
        hasFrame = true;
      } catch (error) {
        console.warn("VGPU transmission frame failed", error);
      }
      return hasFrame;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeResize();
      unsubscribeError();
      meshGeometry?.destroy();
      destroyTargets(targets);
      sourceTexture.destroy();
      env.destroy();
      gpu.dispose();
    },
  };
}

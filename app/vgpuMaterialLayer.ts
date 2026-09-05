import * as WEBGPU from "three/webgpu";
import { mix, positionLocal, time, uniform, vec3 } from "three/tsl";
import type * as THREE from "three";
import { bakeLavaVolumes, type LavaFieldVolumes } from "../three-tsl/bake-lava";
import { createLavaMaterial, type LavaMaterial } from "../three-tsl/lava-material";

export type VgpuSceneMaterial = "VGPU Glass" | "VGPU Holographic" | "VGPU Lava";

export type VgpuSceneOptions = {
  material: VgpuSceneMaterial;
  color: string;
  roughness: number;
  transparency: number;
  ior: number;
  reflection: number;
  frost: number;
  rayAngle: number;
  rayStrength: number;
  showRay: boolean;
  light: number;
  ambientLight: number;
  lightPosition: [number, number, number];
  background: THREE.Scene["background"];
};

type BeamMesh = WEBGPU.Mesh<WEBGPU.PlaneGeometry, WEBGPU.MeshBasicMaterial>;

function makeBeam(length: number, width: number, color: number, opacity: number): BeamMesh {
  const geometry = new WEBGPU.PlaneGeometry(length, width);
  geometry.translate(length / 2, 0, 0);
  const material = new WEBGPU.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: WEBGPU.AdditiveBlending,
    depthWrite: false,
    side: WEBGPU.DoubleSide,
    toneMapped: false,
  });
  const mesh = new WEBGPU.Mesh(geometry, material);
  mesh.renderOrder = -2;
  return mesh;
}

function disposeBeam(group: WEBGPU.Group): void {
  group.traverse((child) => {
    if (child instanceof WEBGPU.Mesh) {
      child.geometry.dispose();
      (child.material as WEBGPU.Material).dispose();
    }
  });
  group.clear();
}

function createHolographicMaterial(color: string, reflection: number, frost: number) {
  const tint = new WEBGPU.Color(color);
  const phase = positionLocal.x.mul(1.7)
    .add(positionLocal.y.mul(2.35))
    .add(positionLocal.z.mul(1.15))
    .add(time.mul(0.16));
  const foil = vec3(
    phase.sin().mul(0.5).add(0.5),
    phase.add(2.094).sin().mul(0.5).add(0.5),
    phase.add(4.188).sin().mul(0.5).add(0.5),
  );
  const material = new WEBGPU.MeshPhysicalNodeMaterial({
    color: tint,
    metalness: 0.18 + reflection * 0.25,
    roughness: 0.08 + frost * 0.48,
    transmission: Math.max(0.08, 0.28 - frost * 0.2),
    thickness: 0.75,
    ior: 1.48,
    iridescence: 1,
    iridescenceIOR: 1.72,
    iridescenceThicknessRange: [120, 920],
    clearcoat: Math.max(0.55, reflection),
    clearcoatRoughness: 0.025 + frost * 0.3,
    transparent: true,
    opacity: 0.94,
    side: WEBGPU.DoubleSide,
  });
  const base = vec3(tint.r, tint.g, tint.b);
  material.colorNode = mix(base.mul(0.52).add(vec3(0.38)), foil, uniform(0.72));
  material.emissiveNode = foil.mul(0.055);
  return material;
}

function createGlassMaterial(options: VgpuSceneOptions) {
  const frost = options.frost;
  const reflection = options.reflection;
  return new WEBGPU.MeshPhysicalNodeMaterial({
    color: new WEBGPU.Color(options.color),
    metalness: 0,
    roughness: Math.max(0.008, frost * 0.74 + options.roughness * 0.08),
    transmission: Math.max(0.08, options.transparency) * (1 - frost * 0.16),
    thickness: 2.2,
    ior: options.ior,
    dispersion: Math.max(0.015, (options.ior - 1) * 0.16),
    clearcoat: reflection,
    clearcoatRoughness: 0.01 + frost * 0.42,
    attenuationColor: new WEBGPU.Color(options.color),
    attenuationDistance: 3.5 + frost * 2,
    transparent: true,
    opacity: 0.98,
    side: WEBGPU.DoubleSide,
  });
}

export async function createVgpuMaterialLayer(canvas: HTMLCanvasElement) {
  if (navigator.gpu === undefined) throw new Error("WebGPU is not available in this browser.");

  const renderer = new WEBGPU.WebGPURenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio, 1), 1.5));
  renderer.toneMapping = WEBGPU.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  await renderer.init();

  const scene = new WEBGPU.Scene();
  const camera = new WEBGPU.PerspectiveCamera(36, 1, 0.1, 100);
  const root = new WEBGPU.Group();
  scene.add(root);

  const placeholder = new WEBGPU.MeshPhysicalNodeMaterial({ color: 0xe0e0e0, roughness: 0.16 });
  const mesh = new WEBGPU.Mesh<WEBGPU.BufferGeometry, WEBGPU.Material>(new WEBGPU.BufferGeometry(), placeholder);
  mesh.castShadow = true;
  root.add(mesh);

  const beamRoot = new WEBGPU.Group();
  root.add(beamRoot);
  const ambient = new WEBGPU.HemisphereLight(0xffffff, 0x181818, 1.8);
  const key = new WEBGPU.DirectionalLight(0xffffff, 4.2);
  const fill = new WEBGPU.DirectionalLight(0xffffff, 2.8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00008;
  key.shadow.normalBias = 0.035;
  fill.position.set(4, -1, 3);
  scene.add(ambient, key, fill);

  let disposed = false;
  let geometryRadius = 1.5;
  let activeMaterial: WEBGPU.Material = placeholder;
  let activeKind: VgpuSceneMaterial | null = null;
  let materialSignature = "";
  let beamSignature = "";
  let volumes: LavaFieldVolumes | null = null;
  let lava: LavaMaterial | null = null;
  let lavaPromise: Promise<void> | null = null;

  const rebuildBeam = (options: VgpuSceneOptions) => {
    const signature = [options.showRay, options.rayStrength, options.rayAngle, options.ior, geometryRadius].join("/");
    if (signature === beamSignature) return;
    beamSignature = signature;
    disposeBeam(beamRoot);
    if (!options.showRay || options.rayStrength <= 0.001) return;
    const radius = Math.max(1.2, geometryRadius * 1.08);
    const inputLength = radius * 2.65;
    const outputLength = radius * 2.25;
    const strength = Math.max(0, Math.min(1, options.rayStrength));
    const angle = WEBGPU.MathUtils.degToRad(options.rayAngle);
    beamRoot.rotation.z = angle;
    beamRoot.position.z = -0.08;

    const input = makeBeam(inputLength, 0.025 + strength * 0.035, 0xffffff, 0.42 + strength * 0.52);
    input.rotation.z = Math.PI;
    input.position.x = radius;
    beamRoot.add(input);

    const colors = [0xff1744, 0xff7a00, 0xffec3d, 0x36ff76, 0x24dcff, 0x2878ff, 0x9d4dff];
    const dispersion = (0.024 + Math.max(0, options.ior - 1) * 0.09) * (0.45 + strength * 0.75);
    colors.forEach((color, index) => {
      const offset = index - (colors.length - 1) / 2;
      const ray = makeBeam(outputLength, 0.025 + strength * 0.04, color, 0.34 + strength * 0.46);
      ray.position.x = radius;
      ray.rotation.z = offset * dispersion;
      beamRoot.add(ray);
    });
  };

  const ensureLava = () => {
    if (lava || lavaPromise) return;
    lavaPromise = bakeLavaVolumes(renderer).then((baked) => {
      if (disposed) {
        baked.dispose();
        return;
      }
      volumes = baked;
      lava = createLavaMaterial({ volumes: baked });
      lava.scale.value = Math.min(1.05, 1.8 / Math.max(1, geometryRadius));
      lava.glowIntensity.value = 1.75;
      if (activeKind === "VGPU Lava") {
        activeMaterial.dispose();
        activeMaterial = lava.material;
        mesh.material = activeMaterial;
      }
    }).catch((error) => {
      console.warn("Official VGPU lava bake failed", error);
    }).finally(() => {
      lavaPromise = null;
    });
  };

  const updateMaterial = (options: VgpuSceneOptions) => {
    const signature = [options.material, options.color, options.roughness, options.transparency, options.ior, options.reflection, options.frost].join("/");
    if (signature === materialSignature) return;
    materialSignature = signature;
    activeKind = options.material;
    if (options.material === "VGPU Lava") {
      ensureLava();
      if (!lava) return;
      if (activeMaterial !== lava.material) activeMaterial.dispose();
      activeMaterial = lava.material;
    } else {
      if (activeMaterial !== lava?.material) activeMaterial.dispose();
      activeMaterial = options.material === "VGPU Holographic"
        ? createHolographicMaterial(options.color, options.reflection, options.frost)
        : createGlassMaterial(options);
    }
    mesh.material = activeMaterial;
  };

  return {
    setGeometry(source: THREE.BufferGeometry) {
      const previous = mesh.geometry;
      mesh.geometry = source.clone() as unknown as WEBGPU.BufferGeometry;
      mesh.geometry.computeBoundingSphere();
      geometryRadius = Math.max(0.5, mesh.geometry.boundingSphere?.radius ?? 1.5);
      if (lava) lava.scale.value = Math.min(1.05, 1.8 / Math.max(1, geometryRadius));
      previous.dispose();
      materialSignature = "";
      beamSignature = "";
    },
    resize(width: number, height: number) {
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    draw(sourceCamera: THREE.PerspectiveCamera, sourceRoot: THREE.Group, options: VgpuSceneOptions) {
      if (disposed || mesh.geometry.attributes.position === undefined) return false;
      updateMaterial(options);
      if (options.material === "VGPU Lava" && !lava) return false;

      camera.fov = sourceCamera.fov;
      camera.aspect = sourceCamera.aspect;
      camera.near = sourceCamera.near;
      camera.far = sourceCamera.far;
      camera.position.copy(sourceCamera.position);
      camera.quaternion.copy(sourceCamera.quaternion);
      camera.updateProjectionMatrix();
      root.position.copy(sourceRoot.position);
      root.quaternion.copy(sourceRoot.quaternion);
      root.scale.copy(sourceRoot.scale);
      scene.background = options.background as unknown as WEBGPU.Scene["background"];
      scene.environment = options.background instanceof Object && "isTexture" in options.background
        ? options.background as unknown as WEBGPU.Texture
        : null;
      key.intensity = options.light / 18;
      fill.intensity = options.light / 30;
      ambient.intensity = options.ambientLight / 45;
      key.position.set(...options.lightPosition);
      rebuildBeam(options);

      renderer.render(scene, camera);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeBeam(beamRoot);
      mesh.geometry.dispose();
      activeMaterial.dispose();
      if (lava && activeMaterial !== lava.material) lava.material.dispose();
      volumes?.dispose();
      renderer.dispose();
    },
  };
}

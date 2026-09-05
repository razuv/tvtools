import * as WEBGPU from "three/webgpu";
import { mix, positionLocal, time, uniform, vec3 } from "three/tsl";
import type * as THREE from "three";
import { bakeLavaVolumes, type LavaFieldVolumes } from "../three-tsl/bake-lava";
import { createLavaMaterial, type LavaMaterial } from "../three-tsl/lava-material";

export type VgpuSceneMaterial = "VGPU Holographic" | "VGPU Lava";

export type VgpuSceneOptions = {
  material: VgpuSceneMaterial;
  color: string;
  roughness: number;
  reflection: number;
  frost: number;
  light: number;
  ambientLight: number;
  lightPosition: [number, number, number];
  background: THREE.Scene["background"];
};

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
  let volumes: LavaFieldVolumes | null = null;
  let lava: LavaMaterial | null = null;
  let lavaPromise: Promise<void> | null = null;

  const ensureLava = () => {
    if (lava || lavaPromise) return;
    lavaPromise = bakeLavaVolumes(renderer).then((baked) => {
      if (disposed) {
        baked.dispose();
        return;
      }
      volumes = baked;
      lava = createLavaMaterial({ volumes: baked });
      // The official demo uses smooth, welded primitives. Playtools extrusion
      // deliberately duplicates vertices at hard cap/side edges; displacing
      // those vertices along different face normals pulls the shell apart.
      // Keep the complete procedural shading and bump pipeline, but leave the
      // watertight user mesh positions intact.
      lava.material.positionNode = null;
      lava.material.side = WEBGPU.DoubleSide;
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
    const signature = [options.material, options.color, options.roughness, options.reflection, options.frost].join("/");
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
      activeMaterial = createHolographicMaterial(options.color, options.reflection, options.frost);
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

      renderer.render(scene, camera);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.geometry.dispose();
      activeMaterial.dispose();
      if (lava && activeMaterial !== lava.material) lava.material.dispose();
      volumes?.dispose();
      renderer.dispose();
    },
  };
}

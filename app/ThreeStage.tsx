"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export type StageHandle = {
  reset: () => void;
  rotate: (axis: "x" | "y" | "z", amount?: number) => void;
  setRotation: (axis: "x" | "y" | "z", degrees: number) => void;
  exportPng: (name: string, withBackground?: boolean) => void;
  exportObj: (name: string) => void;
};

type StageProps = {
  source: string | null;
  fileName: string;
  thickness: number;
  material: string;
  color: string;
  colorOpacity: number;
  glassIor: number;
  glassTransparency: number;
  roughness: number;
  light: number;
  lightX: number;
  lightY: number;
  lightZ: number;
  ambientLight: number;
  shadowSoftness: number;
  shadowOpacity: number;
  shadows: boolean;
  segments: number;
  surfaceDetail: number;
  edge: number;
  mass: number;
  bend: number;
  bulge: number;
  taper: number;
  twist: number;
  textureRepeat: number;
  textureRotation: number;
  textureTint: number;
  background: string;
  onReady?: (triangles: number) => void;
  onLoading?: (loading: boolean) => void;
};

type Runtime = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  model: THREE.Group;
  key: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  shadowFloor: THREE.Mesh;
  worker: Worker;
  requestId: number;
};

const demoPoints = [[.5,.03],[.61,.34],[.94,.23],[.72,.51],[.98,.66],[.64,.65],[.66,.98],[.49,.72],[.27,.96],[.34,.63],[.02,.58],[.31,.43],[.12,.16],[.44,.34]];

function polygonShape(points: number[][]) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => {
    const px = (x - .5) * 3;
    const py = (.5 - y) * 3;
    if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
  });
  shape.closePath();
  return shape;
}

function edgeLoops(data: Uint8ClampedArray, width: number, height: number) {
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * 4 + 3] > 28;
  const next = new Map<string, [number, number]>();
  const key = (x: number, y: number) => `${x},${y}`;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (filled(x, y)) {
    if (!filled(x, y - 1)) next.set(key(x + 1, y), [x, y]);
    if (!filled(x - 1, y)) next.set(key(x, y), [x, y + 1]);
    if (!filled(x, y + 1)) next.set(key(x, y + 1), [x + 1, y + 1]);
    if (!filled(x + 1, y)) next.set(key(x + 1, y + 1), [x + 1, y]);
  }
  const loops: number[][][] = [];
  while (next.size) {
    const first = next.entries().next().value as [string, [number, number]];
    const [startKey] = first;
    const [sx, sy] = startKey.split(",").map(Number);
    const points: number[][] = [[sx, sy]];
    let cursor = startKey;
    let guard = 0;
    while (next.has(cursor) && guard++ < width * height * 8) {
      const point = next.get(cursor)!;
      next.delete(cursor);
      points.push(point);
      cursor = key(point[0], point[1]);
      if (cursor === startKey) break;
    }
    if (points.length > 12) loops.push(points);
  }
  return loops;
}

function signedArea(points: number[][]) {
  return points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + x * ny - nx * y;
  }, 0) / 2;
}

function pointInside(point: number[], poly: number[][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function simplify(points: number[][], target = 280) {
  const stride = Math.max(1, Math.ceil(points.length / target));
  return points.filter((_, i) => i % stride === 0);
}

function limitRing(points: THREE.Vector2[], target: number) {
  if (points.length <= target) return points;
  const result: THREE.Vector2[] = [];
  for (let i = 0; i < target; i++) result.push(points[Math.floor(i * points.length / target)]);
  return result;
}

async function pngShapes(url: string, target: number): Promise<THREE.Shape[]> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(2, Math.round(image.naturalWidth * scale));
  const height = Math.max(2, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, width, height);
  const loops = edgeLoops(context.getImageData(0, 0, width, height).data, width, height).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  if (!loops.length) throw new Error("No opaque contour found");
  const maxSide = Math.max(width, height);
  const normalized = (loop: number[][]) => simplify(loop, target).map(([x, y]) => [(x - width / 2) / maxSide * 3, (height / 2 - y) / maxSide * 3]);
  const outers: { loop: number[][]; shape: THREE.Shape }[] = [];
  loops.forEach((loop) => {
    const containing = outers.find((outer) => pointInside(loop[0], outer.loop));
    const pts = normalized(loop);
    if (containing) {
      const hole = new THREE.Path();
      pts.forEach(([x, y], i) => i ? hole.lineTo(x, y) : hole.moveTo(x, y));
      hole.closePath();
      containing.shape.holes.push(hole);
    } else {
      const shape = new THREE.Shape();
      pts.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
      shape.closePath();
      outers.push({ loop, shape });
    }
  });
  return outers.map((item) => item.shape);
}

async function svgShapes(url: string): Promise<THREE.Shape[]> {
  const text = await fetch(url).then((response) => response.text());
  const parsed = new SVGLoader().parse(text);
  const shapes = parsed.paths.flatMap((path) => SVGLoader.createShapes(path));
  if (!shapes.length) throw new Error("No closed SVG paths found");
  return shapes;
}

const textureAssets: Record<string, [string, string]> = {
  Wood:["/textures/wood.jpg","/textures/wood-normal.jpg"],
  Stone:["/textures/stone.jpg","/textures/stone-normal.jpg"],
  Marble:["/textures/marble.jpg","/textures/marble-normal.jpg"],
  Leather:["/textures/leather.jpg","/textures/leather-normal.jpg"],
  Concrete:["/textures/concrete.jpg","/textures/concrete-normal.jpg"],
};
const textureCache = new Map<string, THREE.Texture>();

function loadTexture(url: string, color = false) {
  if (!textureCache.has(url)) textureCache.set(url, new THREE.TextureLoader().load(url));
  const texture = textureCache.get(url)!;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeMaterial(kind: string, color: string, roughness: number, repeat: number, rotation: number, tint: number, colorOpacity: number, glassIor: number, glassTransparency: number) {
  const value = new THREE.Color(color);
  const r = roughness / 100;
  const alpha=colorOpacity/100;
  let result: THREE.Material;
  if (kind === "Glass") result = new THREE.MeshPhysicalMaterial({ color:value, roughness:Math.max(.015,r*.28), metalness:0, transmission:glassTransparency/100, thickness:1.8, ior:glassIor, dispersion:.035, transparent:true, opacity:alpha, clearcoat:1, clearcoatRoughness:.025, envMapIntensity:1.8, attenuationColor:value, attenuationDistance:3.5 });
  else if (kind === "Metal") result = new THREE.MeshStandardMaterial({ color:value, roughness:Math.max(.12,r), metalness:.88 });
  else if (kind === "Chrome") result = new THREE.MeshPhysicalMaterial({ color:new THREE.Color("#f3f5f7"), roughness:Math.max(.025,r*.22), metalness:1, clearcoat:1, clearcoatRoughness:.02, envMapIntensity:2.8 });
  else if (textureAssets[kind]) {
    const [diffuseUrl, normalUrl] = textureAssets[kind];
    const map = loadTexture(diffuseUrl, true);
    const normalMap = loadTexture(normalUrl);
    [map, normalMap].forEach((texture) => { texture.repeat.set(repeat, repeat); texture.center.set(.5, .5); texture.rotation = THREE.MathUtils.degToRad(rotation); texture.needsUpdate = true; });
    const textureRoughness = kind === "Marble" ? .34 : kind === "Leather" ? .58 : .78;
    const textureColor = new THREE.Color("#ffffff").lerp(value, tint / 100);
    result = new THREE.MeshStandardMaterial({ color:textureColor, map, normalMap, normalScale:new THREE.Vector2(.62,.62), roughness:Math.max(textureRoughness,r), metalness:0 });
  }
  else if (kind === "Clay") result = new THREE.MeshStandardMaterial({ color:value, roughness:Math.max(.82,r), metalness:0 });
  else result = new THREE.MeshPhysicalMaterial({ color:value, roughness:Math.max(.06,r*.7), metalness:.04, clearcoat:1, clearcoatRoughness:.08 });
  if(kind!=="Glass"){result.opacity=alpha;result.transparent=alpha<.999;result.depthWrite=alpha>.96;}
  result.side = THREE.DoubleSide;
  result.shadowSide = THREE.DoubleSide;
  return result;
}

function presetBackground(name: string) {
  if (name === "None") return null;
  if (name.startsWith("blob:")) { const texture = new THREE.TextureLoader().load(name); texture.colorSpace = THREE.SRGBColorSpace; return texture; }
  const canvas = document.createElement("canvas"); canvas.width=1024; canvas.height=1024; const ctx=canvas.getContext("2d")!;
  const gradients:Record<string,string[]> = { Noir:["#070707","#272727"], Sky:["#9ed8ff","#eaf7ff"], Sunset:["#ff805c","#5c3b99"], Gallery:["#e9e5db","#9b968c"], Acid:["#b7f34a","#12360c"] };
  const colors=gradients[name]??gradients.Noir; const gradient=ctx.createLinearGradient(0,0,1024,1024); gradient.addColorStop(0,colors[0]); gradient.addColorStop(1,colors[1]); ctx.fillStyle=gradient; ctx.fillRect(0,0,1024,1024);
  if(name==="Gallery"){ctx.fillStyle="rgba(255,255,255,.22)";for(let x=0;x<1024;x+=128)ctx.fillRect(x,0,1,1024);}
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; return texture;
}

export const ThreeStage = forwardRef<StageHandle, StageProps>(function ThreeStage(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const latestPropsRef = useRef(props);
  latestPropsRef.current = props;

  useImperativeHandle(ref, () => ({
    reset() {
      const runtime = runtimeRef.current; if (!runtime) return;
      runtime.model.rotation.set(THREE.MathUtils.degToRad(-16),THREE.MathUtils.degToRad(28),THREE.MathUtils.degToRad(-7));
      runtime.camera.position.set(0, .1, 5.4);
      runtime.controls.target.set(0, 0, 0); runtime.controls.update();
    },
    rotate(axis, amount = 15) { const runtime = runtimeRef.current; if (runtime) runtime.model.rotation[axis] += THREE.MathUtils.degToRad(amount); },
    setRotation(axis,degrees){const runtime=runtimeRef.current;if(runtime)runtime.model.rotation[axis]=THREE.MathUtils.degToRad(degrees);},
    exportPng(name, withBackground = false) {
      const runtime = runtimeRef.current; if (!runtime) return;
      const host = runtime.renderer.domElement.parentElement!;
      const { width, height } = host.getBoundingClientRect();
      const oldBackground=runtime.scene.background;
      runtime.scene.background=withBackground?(oldBackground??new THREE.Color("#080808")):null;
      runtime.renderer.setSize(1400, 1400, false);
      runtime.camera.aspect = 1;
      runtime.camera.updateProjectionMatrix();
      runtime.renderer.render(runtime.scene, runtime.camera);
      runtime.renderer.domElement.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${name}.png`);
        runtime.renderer.setSize(width, height, false);
        runtime.camera.aspect = width / Math.max(1, height);
        runtime.camera.updateProjectionMatrix();
        runtime.scene.background=oldBackground;
      }, "image/png");
    },
    exportObj(name) {
      const runtime = runtimeRef.current; if (!runtime) return;
      const text = new OBJExporter().parse(runtime.model);
      downloadBlob(new Blob([text], { type:"text/plain" }), `${name}.obj`);
    },
  }));

  useEffect(() => {
    const host = hostRef.current!;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
    camera.position.set(0, .1, 5.4);
    const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    pmrem.dispose();
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .075; controls.enablePan = false; controls.minDistance = 3; controls.maxDistance = 8;
    const model = new THREE.Group(); model.rotation.set(THREE.MathUtils.degToRad(-16),THREE.MathUtils.degToRad(28),THREE.MathUtils.degToRad(-7)); scene.add(model);
    const ambient=new THREE.HemisphereLight(0xffffff,0x202020,1.8);scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 4.2); key.position.set(-3, 5, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = .1; key.shadow.camera.far = 20;
    key.shadow.camera.left = -5; key.shadow.camera.right = 5; key.shadow.camera.top = 5; key.shadow.camera.bottom = -5;
    key.shadow.bias = -.00008; key.shadow.normalBias = .035;
    key.shadow.radius = 5;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 2.8); fill.position.set(4, -1, 3); scene.add(fill);
    const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color:0x000000, opacity:.18, transparent:true }));
    shadowFloor.rotation.x = -Math.PI / 2;
    shadowFloor.position.y = -1.72;
    shadowFloor.receiveShadow = true;
    scene.add(shadowFloor);
    const worker=new Worker(new URL("./geometry.worker.ts",import.meta.url),{type:"module"});
    runtimeRef.current = { scene, camera, renderer, controls, model, key, fill, ambient, shadowFloor, worker, requestId:0 };
    worker.onmessage=(event)=>{
      const runtime=runtimeRef.current;if(!runtime||event.data.id!==runtime.requestId)return;
      latestPropsRef.current.onLoading?.(false);
      if(event.data.error)return;
      const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.BufferAttribute(event.data.position,3));geometry.setAttribute("normal",new THREE.BufferAttribute(event.data.normal,3));if(event.data.uv.length)geometry.setAttribute("uv",new THREE.BufferAttribute(event.data.uv,2));geometry.computeBoundingBox();geometry.computeBoundingSphere();
      runtime.model.traverse(child=>{if(child instanceof THREE.Mesh){child.geometry.dispose();(child.material as THREE.Material).dispose();}});runtime.model.clear();
      const current=latestPropsRef.current;const mesh=new THREE.Mesh(geometry,makeMaterial(current.material,current.color,current.roughness,current.textureRepeat,current.textureRotation,current.textureTint,current.colorOpacity,current.glassIor,current.glassTransparency));mesh.castShadow=true;mesh.receiveShadow=false;runtime.model.add(mesh);current.onReady?.(Math.round(event.data.triangles));
    };
    const resize = () => { const { width, height } = host.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    let frame = 0; const loop = () => { controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(loop); }; loop();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); worker.terminate(); controls.dispose(); renderer.dispose(); host.removeChild(renderer.domElement); runtimeRef.current = null; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const build = async () => {
      const runtime = runtimeRef.current; if (!runtime) return;
      let shapes: THREE.Shape[];
      try { shapes = props.source ? (props.fileName.toLowerCase().endsWith(".svg") ? await svgShapes(props.source) : await pngShapes(props.source, 48 + props.segments * 18)) : [polygonShape(demoPoints)]; }
      catch { shapes = [polygonShape(demoPoints)]; }
      await new Promise(resolve=>window.setTimeout(resolve,70));
      if (cancelled || !runtimeRef.current) return;
      const deforming=Math.abs(props.mass)+Math.abs(props.bend)+Math.abs(props.bulge)+Math.abs(props.taper)+Math.abs(props.twist)>0;
      const requestId=++runtime.requestId;const heavy=props.segments>=64||(deforming&&props.surfaceDetail>=3)||props.mass>=70||props.edge>=180;props.onLoading?.(heavy);
      // SVGLoader samples every curve separately, so a nominal value of 256
      // can otherwise create thousands of contour points per ring. Preserve
      // the requested visual detail while bounding the actual ring density.
      const ringLimit=Math.min(384,Math.max(48,48+props.segments));
      const sampled=shapes.map(shape=>({outer:limitRing(shape.getPoints(Math.max(3,props.segments)),ringLimit).map(point=>[point.x,point.y]),holes:shape.holes.map(hole=>limitRing(hole.getPoints(Math.max(3,props.segments)),ringLimit).map(point=>[point.x,point.y]))}));
      runtime.worker.postMessage({id:requestId,shapes:sampled,thickness:props.thickness,segments:props.segments,surfaceDetail:props.surfaceDetail,edge:props.edge,mass:props.mass,bend:props.bend,bulge:props.bulge,taper:props.taper,twist:props.twist});
    };
    build(); return () => { cancelled = true; };
  }, [props.source, props.fileName, props.thickness, props.segments, props.surfaceDetail, props.edge, props.mass, props.bend, props.bulge, props.taper, props.twist]);

  useEffect(() => {
    const runtime = runtimeRef.current; if (!runtime) return;
    runtime.model.traverse((child) => { if (child instanceof THREE.Mesh) { const old = child.material as THREE.Material; child.material = makeMaterial(props.material, props.color, props.roughness, props.textureRepeat, props.textureRotation, props.textureTint,props.colorOpacity,props.glassIor,props.glassTransparency); old.dispose(); } });
  }, [props.material, props.color, props.roughness, props.textureRepeat, props.textureRotation, props.textureTint,props.colorOpacity,props.glassIor,props.glassTransparency]);

  useEffect(() => { const runtime = runtimeRef.current; if (runtime) { runtime.key.intensity = props.light / 18; runtime.fill.intensity = props.light / 30; runtime.ambient.intensity=props.ambientLight/45;runtime.key.position.set(props.lightX,props.lightY,props.lightZ);runtime.key.shadow.radius=THREE.MathUtils.mapLinear(props.shadowSoftness,0,100,1,12);(runtime.shadowFloor.material as THREE.ShadowMaterial).opacity=props.shadowOpacity/100;runtime.shadowFloor.visible=props.shadows; runtime.key.castShadow=props.shadows; } }, [props.light,props.lightX,props.lightY,props.lightZ,props.ambientLight,props.shadowSoftness,props.shadowOpacity,props.shadows]);

  useEffect(() => {
    const runtime=runtimeRef.current; if(!runtime)return;
    const old=runtime.scene.background; runtime.scene.background=presetBackground(props.background);
    if(old instanceof THREE.Texture && !Array.from(textureCache.values()).includes(old)) old.dispose();
  },[props.background]);

  return <div ref={hostRef} className="webgl-stage" aria-label="Interactive WebGL 3D model" />;
});

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

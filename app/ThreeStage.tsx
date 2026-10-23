"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { addEffectPipeline } from "./backgroundComposite";
import { addFurShells, removeFurShells } from "./furMaterial";
import { ModelPhysics } from "./gravity";
import { backgroundPresets, paintBackgroundFill, type BackgroundFill } from "./backgroundFill";
import { parseModel } from "./modelImport";
import { setCameraView, getCameraView } from "./cameraView";
import { applyColorGradient, type GradientSettings } from "./gradientMaterial";
import { useTriplanarMaps } from "./triplanar";
import { createShaderMaterial, shaderPresets, type ShaderPreset } from "./shaderMaterials";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { parse as parseOpenType, type Font, type PathCommand } from "opentype.js";
import { EndType, FillRule, inflatePathsD, JoinType, simplifyPathD, unionD, type PathD } from "clipper2-ts";

export type StageHandle = {
  setCamera: (kind:"zoom"|"focalLength",value:number) => void;
  reset: () => void;
  center: () => void;
  rotate: (axis: "x" | "y" | "z", amount?: number) => void;
  setRotation: (axis: "x" | "y" | "z", degrees: number) => void;
  exportPng: (name: string, withBackground?: boolean) => void;
  exportObj: (name: string) => void;
  exportTxt: (name: string) => void;
};

type StageProps = GradientSettings & {
  gravity?:boolean;
  furLength?:number;
  furDensity?:number;
  backgroundFill?:BackgroundFill;
  source: string | null;
  fileName: string;
  text?: string;
  fontUrl?: string;
  fontWeight: number;
  letterSpacing: number;
  lineSpacing: number;
  geometryMode: "Extrude" | "Revolve" | "Inflate";
  thickness: number;
  material: string;
  customMaterialUrl?: string;
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
  revolveAngle: number;
  revolveEdge: "Outer" | "Inner";
  inflateAmount: number;
  inflateDirection: "Outward" | "Inward";
  bend: number;
  bulge: number;
  taper: number;
  twist: number;
  textureRepeat: number;
  textureRotation: number;
  textureTint: number;
  normalStrength: number;
  demoSpin?: boolean;
  asciiCharacters: number;
  asciiGlyphs: string;
  effect: string;
  effectIntensity: number;
  effectBlur: number;
  effectBackground: boolean;
  duotoneDarkColor: string;
  duotoneColor: string;
  background: string;
  onReady?: (triangles: number) => void;
  onLoading?: (loading: boolean) => void;
  onError?: (message: string) => void;
  onCameraChange?: (view:{zoom:number;focalLength:number}) => void;
  onRotationChange?: (rotation: {x:number;y:number;z:number}) => void;
};

type Runtime = {
  exporting:boolean;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  effectPass: ShaderPass;
  compositePass:ShaderPass;
  backgroundTarget: THREE.WebGLRenderTarget;
  controls: OrbitControls;
  model: THREE.Group;
  key: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  shadowFloor: THREE.Mesh;
  worker: Worker;
  requestId: number;
  asciiCanvas: HTMLCanvasElement;
  asciiSample: HTMLCanvasElement;
  asciiLastFrame: number;
  autoRotate: boolean;
  lastRotationEmit: number;
};

const effectModes:Record<string,number>={None:0,Cartoon:1,Sketch:2,Halftone:3,Pixelate:4,Chromatic:5,Duotone:6,Dither:7,Thermal:9};
const postEffectShader={
  uniforms:{
    tDiffuse:{value:null},
    resolution:{value:new THREE.Vector2(1,1)},
    mode:{value:0},
    intensity:{value:1},
    blur:{value:4},
    expandCellAlpha:{value:0},
    duotoneDarkColor:{value:new THREE.Color("#090c13")},
    duotoneColor:{value:new THREE.Color("#ff7a45")},
  },
  vertexShader:`varying vec2 vUv;
    void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float mode;
    uniform float intensity;
    uniform float blur;
    uniform float expandCellAlpha;
    uniform vec3 duotoneDarkColor;
    uniform vec3 duotoneColor;
    varying vec2 vUv;
    float luma(vec3 color){return dot(color,vec3(.2126,.7152,.0722));}
    float sobel(vec2 uv){
      vec2 t=1.0/max(resolution,vec2(1.0));
      float tl=luma(texture2D(tDiffuse,uv+t*vec2(-1.0,1.0)).rgb);
      float tc=luma(texture2D(tDiffuse,uv+t*vec2(0.0,1.0)).rgb);
      float tr=luma(texture2D(tDiffuse,uv+t*vec2(1.0,1.0)).rgb);
      float ml=luma(texture2D(tDiffuse,uv+t*vec2(-1.0,0.0)).rgb);
      float mr=luma(texture2D(tDiffuse,uv+t*vec2(1.0,0.0)).rgb);
      float bl=luma(texture2D(tDiffuse,uv+t*vec2(-1.0,-1.0)).rgb);
      float bc=luma(texture2D(tDiffuse,uv+t*vec2(0.0,-1.0)).rgb);
      float br=luma(texture2D(tDiffuse,uv+t*vec2(1.0,-1.0)).rgb);
      float gx=-tl-2.0*ml-bl+tr+2.0*mr+br;
      float gy=tl+2.0*tc+tr-bl-2.0*bc-br;
      return length(vec2(gx,gy));
    }
    vec4 blurred(vec2 uv){
      vec2 stepUv=vec2(blur)/max(resolution,vec2(1.0));
      vec4 color=texture2D(tDiffuse,uv)*.25;
      color+=(texture2D(tDiffuse,uv+vec2(stepUv.x,0.0))+texture2D(tDiffuse,uv-vec2(stepUv.x,0.0))+texture2D(tDiffuse,uv+vec2(0.0,stepUv.y))+texture2D(tDiffuse,uv-vec2(0.0,stepUv.y)))*.125;
      color+=(texture2D(tDiffuse,uv+stepUv*.7071)+texture2D(tDiffuse,uv-stepUv*.7071)+texture2D(tDiffuse,uv+vec2(stepUv.x,-stepUv.y)*.7071)+texture2D(tDiffuse,uv+vec2(-stepUv.x,stepUv.y)*.7071))*.0625;
      return color;
    }
    void main(){
      vec4 base=texture2D(tDiffuse,vUv);
      float amount=clamp(intensity,0.0,1.0);
      vec3 result=base.rgb;
      float outputAlpha=base.a;
      if(mode>0.5&&mode<1.5){
        float levels=mix(7.0,3.0,amount);
        vec3 quantized=floor(base.rgb*levels+.5)/levels;
        float edge=smoothstep(mix(.42,.12,amount),mix(.82,.32,amount),sobel(vUv));
        result=mix(base.rgb,quantized*(1.0-edge*.9),amount);
      }else if(mode>1.5&&mode<2.5){
        float edge=smoothstep(mix(.3,.08,amount),mix(.72,.28,amount),sobel(vUv));
        float paper=.98-luma(base.rgb)*.08;
        vec3 sketch=vec3(clamp(paper-edge*1.25,0.0,1.0));
        result=mix(base.rgb,sketch,amount);
      }else if(mode>2.5&&mode<3.5){
        float cell=mix(5.0,15.0,amount);
        vec2 grid=floor(vUv*resolution/cell)*cell/resolution;
        vec4 sampleColor=texture2D(tDiffuse,grid+cell*.5/resolution);
        vec2 point=fract(vUv*resolution/cell)-.5;
        float radius=mix(.08,.48,1.0-luma(sampleColor.rgb));
        float dotDistance=length(point);
        float dotAntialias=max(fwidth(dotDistance)*.75,.0015);
        float dotMask=1.0-smoothstep(radius-dotAntialias,radius+dotAntialias,dotDistance);
        vec3 printColor=mix(vec3(1.0),sampleColor.rgb*.35,dotMask);
        result=printColor;
        outputAlpha=mix(base.a,dotMask*sampleColor.a,expandCellAlpha);
      }else if(mode>3.5&&mode<4.5){
        float cell=mix(2.0,28.0,amount);
        vec2 pixelUv=(floor(vUv*resolution/cell)+.5)*cell/resolution;
        vec4 pixel=texture2D(tDiffuse,pixelUv);
        result=pixel.a>.04?pixel.rgb:base.rgb;
        outputAlpha=mix(base.a,pixel.a,expandCellAlpha);
      }else if(mode>4.5&&mode<5.5){
        vec2 offset=vec2(1.0,0.35)/max(resolution,vec2(1.0))*amount*12.0;
        vec3 split=vec3(blurred(vUv+offset).r,blurred(vUv).g,blurred(vUv-offset).b);
        result=mix(base.rgb,split,amount);
      }else if(mode>5.5&&mode<6.5){
        float lightness=luma(base.rgb);
        vec3 duo=mix(duotoneDarkColor,duotoneColor,smoothstep(.08,.92,lightness));
        result=mix(base.rgb,duo,amount);
      }else if(mode>6.5&&mode<7.5){
        vec2 p=mod(floor(gl_FragCoord.xy),4.0);
        float index=p.x+p.y*4.0;
        float threshold=fract(index*.61803398875);
        float value=step(threshold,mix(luma(base.rgb),dot(base.rgb,vec3(.333)),amount));
        result=mix(base.rgb,vec3(value),amount);

      }
      if(mode>8.5&&mode<9.5){
        float v=clamp(luma(base.rgb),0.0,1.0);
        vec3 cold=mix(vec3(.015,0.0,.06),vec3(.18,.02,.65),smoothstep(0.0,.25,v));
        vec3 warm=mix(cold,vec3(1.0,.04,.005),smoothstep(.2,.55,v));
        vec3 hot=mix(warm,vec3(1.0,.85,.02),smoothstep(.5,.8,v));
        result=mix(base.rgb,mix(hot,vec3(1.0),smoothstep(.8,1.0,v)),amount);
      }
      if(mode>8.5&&luma(base.rgb)<.00001)result=base.rgb;
      vec4 outputColor=vec4(result,outputAlpha);

      gl_FragColor=outputColor;
    }`,
};

function renderWithEffects(runtime:Runtime,props:StageProps,includeBackground=true){
  runtime.effectPass.uniforms.mode.value=effectModes[props.effect]??0;
  runtime.effectPass.uniforms.intensity.value=props.effectIntensity/100;
  runtime.effectPass.uniforms.blur.value=props.effectBlur;
  runtime.effectPass.uniforms.duotoneDarkColor.value.set(props.duotoneDarkColor);
  runtime.effectPass.uniforms.duotoneColor.value.set(props.duotoneColor);
  runtime.effectPass.uniforms.resolution.value.set(runtime.renderer.domElement.width,runtime.renderer.domElement.height);
  const isolateModel=!includeBackground||!props.effectBackground;
  runtime.effectPass.uniforms.expandCellAlpha.value=isolateModel?1:0;
  runtime.compositePass.enabled=isolateModel&&includeBackground;
  if(isolateModel){
    const background=runtime.scene.background;
    const modelVisible=runtime.model.visible;
    const floorVisible=runtime.shadowFloor.visible;
    if(includeBackground){
      runtime.model.visible=false;runtime.shadowFloor.visible=false;
      runtime.renderer.setRenderTarget(runtime.backgroundTarget);
      runtime.renderer.clear();runtime.renderer.render(runtime.scene,runtime.camera);
      runtime.renderer.setRenderTarget(null);
      runtime.compositePass.uniforms.tBackground.value=runtime.backgroundTarget.texture;
    }
    runtime.scene.background=null;runtime.model.visible=modelVisible;runtime.shadowFloor.visible=floorVisible;
    runtime.composer.render();
    runtime.scene.background=background;
    return;
  }
  runtime.composer.render();
}

const defaultAsciiRamp = " .,:;irsXA253hMHGS#9B&@";

function asciiRowsFromPixels(data: Uint8ClampedArray, columns: number, rows: number, glyphs:string) {
  const symbols=Array.from(glyphs.replace(/[\r\n\t]/g,"")).slice(0,96);
  const ramp=symbols.length?symbols:Array.from(defaultAsciiRamp);
  const lines:string[][]=[];
  for(let y=0;y<rows;y++){
    const line:string[]=[];
    for(let x=0;x<columns;x++){
      const offset=(y*columns+x)*4;
      const alpha=data[offset+3]/255;
      if(alpha<.08){line.push(" ");continue;}
      const luminance=(data[offset]*.2126+data[offset+1]*.7152+data[offset+2]*.0722)/255;
      line.push(ramp[Math.min(ramp.length-1,Math.floor(luminance*(ramp.length-1)))]);
    }
    lines.push(line);
  }
  return lines;
}

function renderAscii(runtime:Runtime,width:number,height:number,backgroundMode:"scene"|"transparent"|"opaque",glyphs:string,target=runtime.asciiCanvas,columns=Math.max(40,Math.min(220,Math.round(width/7)))){
  const {renderer,scene,camera,model,shadowFloor,asciiSample}=runtime;
  const oldBackground=scene.background;
  const oldFloorVisible=shadowFloor.visible;
  const oldModelVisible=model.visible;
  const pixelRatio=target===runtime.asciiCanvas?Math.min(window.devicePixelRatio,2):1;
  const outputWidth=Math.max(1,Math.round(width*pixelRatio));
  const outputHeight=Math.max(1,Math.round(height*pixelRatio));
  if(target.width!==outputWidth||target.height!==outputHeight){target.width=outputWidth;target.height=outputHeight;}
  const context=target.getContext("2d")!;
  context.clearRect(0,0,outputWidth,outputHeight);

  scene.background=backgroundMode==="transparent"?null:backgroundMode==="opaque"?(oldBackground??new THREE.Color("#080808")):oldBackground;
  model.visible=false;
  renderer.render(scene,camera);
  context.drawImage(renderer.domElement,0,0,outputWidth,outputHeight);

  scene.background=null;
  shadowFloor.visible=false;
  model.visible=true;
  renderer.render(scene,camera);
  const rows=Math.max(24,Math.round(columns*height/Math.max(1,width)*.5));
  asciiSample.width=columns;
  asciiSample.height=rows;
  const sampleContext=asciiSample.getContext("2d",{willReadFrequently:true})!;
  sampleContext.clearRect(0,0,columns,rows);
  sampleContext.drawImage(renderer.domElement,0,0,columns,rows);
  const pixels=sampleContext.getImageData(0,0,columns,rows).data;
  const lines=asciiRowsFromPixels(pixels,columns,rows,glyphs);
  const cellWidth=outputWidth/columns;
  const cellHeight=outputHeight/rows;
  context.font=`${Math.ceil(cellHeight*1.12)}px "JetBrains Mono",monospace`;
  context.textAlign="center";
  context.textBaseline="middle";
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const character=lines[y]?.[x]??" ";
    if(character===" ")continue;
    const offset=(y*columns+x)*4;
    context.fillStyle=`rgba(${pixels[offset]},${pixels[offset+1]},${pixels[offset+2]},${pixels[offset+3]/255})`;
    context.fillText(character,(x+.5)*cellWidth,(y+.5)*cellHeight);
  }
  scene.background=oldBackground;
  shadowFloor.visible=oldFloorVisible;
  model.visible=oldModelVisible;
  return lines.map(line=>line.join("").trimEnd()).join("\n");
}

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
  const key = (x: number, y: number) => `${x},${y}`;
  type Edge={from:[number,number];to:[number,number];used:boolean};
  const edges:Edge[]=[],outgoing=new Map<string,Edge[]>();
  const add=(from:[number,number],to:[number,number])=>{
    const edge={from,to,used:false};edges.push(edge);
    const start=key(from[0],from[1]),list=outgoing.get(start)??[];list.push(edge);outgoing.set(start,list);
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (filled(x, y)) {
    if (!filled(x, y - 1)) add([x + 1, y],[x, y]);
    if (!filled(x - 1, y)) add([x, y],[x, y + 1]);
    if (!filled(x, y + 1)) add([x, y + 1],[x + 1, y + 1]);
    if (!filled(x + 1, y)) add([x + 1, y + 1],[x + 1, y]);
  }
  const loops: number[][][] = [];
  for(const first of edges){
    if(first.used)continue;
    const points:number[][]=[first.from];
    let edge:Edge|undefined=first;
    let guard = 0;
    while(edge&&!edge.used&&guard++<edges.length+1){
      edge.used=true;points.push(edge.to);
      if(edge.to[0]===first.from[0]&&edge.to[1]===first.from[1])break;
      const candidates:Edge[]=(outgoing.get(key(edge.to[0],edge.to[1]))??[]).filter(candidate=>!candidate.used);
      if(!candidates.length){edge=undefined;break;}
      const dx:number=edge.to[0]-edge.from[0],dy:number=edge.to[1]-edge.from[1];
      // At a diagonal pixel contact two contours share one vertex. Following
      // the strongest clockwise turn keeps each filled region on the left and
      // prevents the unrelated loops from being stitched into a false bridge.
      edge=candidates.slice(1).reduce<Edge>((best,candidate):Edge=>{
        const turn=(item:Edge):number=>Math.atan2(dx*(item.to[1]-item.from[1])-dy*(item.to[0]-item.from[0]),dx*(item.to[0]-item.from[0])+dy*(item.to[1]-item.from[1]));
        return turn(candidate)<turn(best)?candidate:best;
      },candidates[0]);
    }
    if(points.length>12&&points[points.length-1][0]===points[0][0]&&points[points.length-1][1]===points[0][1]){points.pop();loops.push(points);}
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

function pointSegmentDistance(point:number[],start:number[],end:number[]){
  const dx=end[0]-start[0],dy=end[1]-start[1],lengthSquared=dx*dx+dy*dy;
  if(!lengthSquared)return Math.hypot(point[0]-start[0],point[1]-start[1]);
  const t=THREE.MathUtils.clamp(((point[0]-start[0])*dx+(point[1]-start[1])*dy)/lengthSquared,0,1);
  return Math.hypot(point[0]-(start[0]+dx*t),point[1]-(start[1]+dy*t));
}

function simplifyOpenRing(points:number[][],epsilon:number):number[][]{
  if(points.length<=2)return points;
  let distance=0,index=0;
  for(let i=1;i<points.length-1;i++){const next=pointSegmentDistance(points[i],points[0],points[points.length-1]);if(next>distance){distance=next;index=i;}}
  if(distance<=epsilon)return[points[0],points[points.length-1]];
  const left=simplifyOpenRing(points.slice(0,index+1),epsilon),right=simplifyOpenRing(points.slice(index),epsilon);
  return[...left.slice(0,-1),...right];
}

function ringSelfIntersects(points:number[][]){
  const direction=(a:number[],b:number[],c:number[])=>(c[0]-a[0])*(b[1]-a[1])-(b[0]-a[0])*(c[1]-a[1]);
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    for(let j=i+1;j<points.length;j++){
      if(j===i||j===(i+1)%points.length||i===(j+1)%points.length)continue;
      const c=points[j],d=points[(j+1)%points.length];
      if(direction(a,b,c)*direction(a,b,d)<0&&direction(c,d,a)*direction(c,d,b)<0)return true;
    }
  }
  return false;
}

function safeRasterRing(points:number[][],epsilon:number){
  const clean=points.filter((point,index)=>{
    const previous=points[(index-1+points.length)%points.length],next=points[(index+1)%points.length];
    return (point[0]-previous[0])*(next[1]-point[1])!==(point[1]-previous[1])*(next[0]-point[0]);
  });
  if(clean.length<4)return clean;
  const first=clean.reduce((best,point,index)=>point[0]<clean[best][0]?index:best,0);
  let opposite=first,distance=-1;
  clean.forEach((point,index)=>{const next=Math.hypot(point[0]-clean[first][0],point[1]-clean[first][1]);if(next>distance){distance=next;opposite=index;}});
  const arc=(start:number,end:number)=>{const result:number[][]=[];for(let i=start;;i=(i+1)%clean.length){result.push(clean[i]);if(i===end)break;}return result;};
  const simplifyClosed=(amount:number)=>[...simplifyOpenRing(arc(first,opposite),amount).slice(0,-1),...simplifyOpenRing(arc(opposite,first),amount).slice(0,-1)];
  // Keep every resulting point on the original silhouette. Moving vertices to
  // smooth them can make close strokes cross at joins such as A, R and K.
  const simplified=simplifyClosed(epsilon);
  if(!ringSelfIntersects(simplified))return simplified;
  const conservative=simplifyClosed(epsilon*.35);
  return ringSelfIntersects(conservative)?clean:conservative;
}

function limitRing(points: THREE.Vector2[], target: number) {
  if (points.length <= target) return points;
  const source:PathD=points.map(point=>({x:point.x,y:point.y}));
  const xs=points.map(point=>point.x),ys=points.map(point=>point.y);
  let low=0,high=Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)),best=source;
  // Uniformly dropping vertices can skip a whole serif or a narrow counter.
  // Find the smallest closed-path tolerance that meets the requested budget;
  // reject a candidate whenever simplifying it would alter the topology.
  for(let iteration=0;iteration<24;iteration++){
    const epsilon=(low+high)/2,candidate=simplifyPathD(source,epsilon,true);
    if(candidate.length<3)high=epsilon;
    else if(candidate.length>target)low=epsilon;
    else if(ringSelfIntersects(candidate.map(point=>[point.x,point.y])))high=epsilon;
    else{best=candidate;high=epsilon;}
  }
  // Correct topology wins over a hard point budget for exceptionally intricate
  // glyphs. Normally the binary search lands very close to the target.
  return best.map(point=>new THREE.Vector2(point.x,point.y));
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
  return rasterShapes(context.getImageData(0, 0, width, height).data, width, height, target);
}

function rasterShapes(data: Uint8ClampedArray, width: number, height: number, target: number, smooth=false, flipY=true): THREE.Shape[] {
  const loops = edgeLoops(data, width, height).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  if (!loops.length) throw new Error("No opaque contour found");
  const maxSide = Math.max(width, height);
  const normalized = (loop: number[][]) => {
    const prepared=smooth?safeRasterRing(loop,Math.max(1,maxSide/1100)):simplify(loop,target);
    return simplify(prepared,target).map(([x,y])=>[(x-width/2)/maxSide*3,(flipY?height/2-y:y-height/2)/maxSide*3]);
  };
  const outers: { loop: number[][]; shape: THREE.Shape }[] = [];
  loops.forEach((loop,index) => {
    const parents=loops.slice(0,index).filter(parent=>pointInside(loop[0],parent));
    const isHole=parents.length%2===1;
    const pts = normalized(loop);
    if (isHole) {
      const containing=[...outers].reverse().find(outer=>pointInside(loop[0],outer.loop));
      if(!containing)return;
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
  const shapes = parsed.paths.flatMap((path) => path.toShapes());
  if (!shapes.length) throw new Error("No closed SVG paths found");
  return shapes;
}

const fontCache = new Map<string, Promise<Font>>();

function loadFont(url: string) {
  return fetch(url).then(async (response) => {
    if (!response.ok) throw new Error(`Could not load font (${response.status})`);
    return parseOpenType(await response.arrayBuffer());
  });
}

async function textShapes(text: string, fontUrl: string, fontWeight=400, letterSpacing=0, lineSpacing=118): Promise<THREE.Shape[]> {
  if (!fontCache.has(fontUrl)) fontCache.set(fontUrl, loadFont(fontUrl));
  const font = await fontCache.get(fontUrl)!;
  const fallbackUrl=`${import.meta.env.BASE_URL}fonts/inter.ttf`;
  if (!fontCache.has(fallbackUrl)) fontCache.set(fallbackUrl, loadFont(fallbackUrl));
  const fallback = await fontCache.get(fallbackUrl)!;
  const lines = text.split(/\r?\n/).slice(0, 5);
  const shapes:THREE.Shape[]=[];
  const replay=(target:THREE.Path,commands:PathCommand[])=>commands.forEach(command=>{
    if(command.type==="M")target.moveTo(command.x,command.y);
    else if(command.type==="L")target.lineTo(command.x,command.y);
    else if(command.type==="C")target.bezierCurveTo(command.x1,command.y1,command.x2,command.y2,command.x,command.y);
    else if(command.type==="Q")target.quadraticCurveTo(command.x1,command.y1,command.x,command.y);
    else target.closePath();
  });
  const vectorGlyphShapes=(commands:PathCommand[])=>{
    const contours:PathCommand[][]=[];
    let contour:PathCommand[]=[];
    commands.forEach(command=>{
      if(command.type==="M"&&contour.length){contours.push(contour);contour=[];}
      contour.push(command);
      if(command.type==="Z"){contours.push(contour);contour=[];}
    });
    if(contour.length)contours.push(contour);
    const sourcePaths:PathD[]=contours.map(items=>{
      const path=new THREE.Path();replay(path,items);path.closePath();
      const points=path.getPoints(160).map(point=>({x:point.x,y:point.y}));
      if(points.length>1&&points[0].x===points[points.length-1].x&&points[0].y===points[points.length-1].y)points.pop();
      return points;
    }).filter(points=>points.length>=3);
    // Some variable TrueType fonts encode a counter and its outer boundary as
    // one overlapping path (Inter's P is a common example). Resolve the
    // non-zero font fill with vector polygon union. This splits touching paths
    // into simple rings without ever passing through pixels or Canvas.
    const resolved=unionD(sourcePaths,[],FillRule.NonZero,4);
    const weighted=Math.abs(fontWeight-400)<1?resolved:inflatePathsD(resolved,(fontWeight-400)*.12,JoinType.Round,EndType.Polygon,2,4);
    const paths=unionD(weighted,[],FillRule.NonZero,4).map(path=>{
      const points=path.map(point=>[point.x,point.y]);
      return {points,area:Math.abs(signedArea(points))};
    }).filter(item=>item.points.length>=3&&item.area>1e-4).sort((a,b)=>b.area-a.area);
    const outers:{points:number[][];shape:THREE.Shape}[]=[];
    paths.forEach((item,index)=>{
      // Font winding direction differs between TrueType and CFF fonts. Depth
      // parity is format-independent and preserves counters such as P, B, 8.
      const depth=paths.slice(0,index).filter(parent=>pointInside(item.points[0],parent.points)).length;
      if(depth%2===0){const shape=new THREE.Shape();item.points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();outers.push({points:item.points,shape});}
      else{
        const owner=[...outers].reverse().find(outer=>pointInside(item.points[0],outer.points));
        if(owner){const hole=new THREE.Path();item.points.forEach(([x,y],i)=>i?hole.lineTo(x,y):hole.moveTo(x,y));hole.closePath();owner.shape.holes.push(hole);}
      }
    });
    return outers.map(item=>item.shape);
  };
  lines.forEach((line, index) => {
    const glyphs=Array.from(line||" ").map(character=>{const primary=font.charToGlyph(character);return primary.index!==0||character===" "?{glyph:primary,font}:{glyph:fallback.charToGlyph(character),font:fallback};});
    let cursor=0;
    glyphs.forEach((entry,glyphIndex)=>{
      const path=entry.glyph.getPath(cursor,index*1000*(lineSpacing/100),1000,{},entry.font);
      if(path.commands.length)shapes.push(...vectorGlyphShapes(path.commands));
      cursor+=(entry.glyph.advanceWidth??entry.font.unitsPerEm)*1000/entry.font.unitsPerEm;
      const next=glyphs[glyphIndex+1];if(next&&next.font===entry.font)cursor+=entry.font.getKerningValue(entry.glyph,next.glyph)*1000/entry.font.unitsPerEm;
      if(glyphIndex<glyphs.length-1)cursor+=letterSpacing*10;
    });
  });
  if(!shapes.length)throw new Error("Text contains no supported glyphs");
  return shapes;
}

const textureAssets: Record<string, [string, string, string?]> = {
  Wood:[`${import.meta.env.BASE_URL}textures/wood.jpg`,`${import.meta.env.BASE_URL}textures/wood-normal.jpg`],
  Stone:[`${import.meta.env.BASE_URL}textures/stone.jpg`,`${import.meta.env.BASE_URL}textures/stone-normal.jpg`],
  Marble:[`${import.meta.env.BASE_URL}textures/marble.jpg`,`${import.meta.env.BASE_URL}textures/marble-normal.jpg`],
  Leather:[`${import.meta.env.BASE_URL}textures/leather.jpg`,`${import.meta.env.BASE_URL}textures/leather-normal.jpg`],
  Concrete:[`${import.meta.env.BASE_URL}textures/concrete.jpg`,`${import.meta.env.BASE_URL}textures/concrete-normal.jpg`],
  Rubber:[`${import.meta.env.BASE_URL}textures/rubber.jpg`,`${import.meta.env.BASE_URL}textures/rubber-normal.jpg`,`${import.meta.env.BASE_URL}textures/rubber-roughness.jpg`],
};
const textureCache = new Map<string, THREE.Texture>();

function loadTexture(url: string, color = false) {
  if (!textureCache.has(url)) textureCache.set(url, new THREE.TextureLoader().load(url));
  const texture = textureCache.get(url)!;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  else texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy=8;
  return texture;
}

function makeMaterial(kind: string, color: string, roughness: number, repeat: number, rotation: number, tint: number, normalStrength: number, colorOpacity: number, glassIor: number, glassTransparency: number, customMaterialUrl?:string, objectDepth=1,triplanar=false,bounds?:THREE.Box3,appearance?:GradientSettings) {
  const value = new THREE.Color(color);
  const r = roughness / 100;
  const alpha=colorOpacity/100;
  let result: THREE.Material;
  if(kind==="Fur")result=new THREE.MeshStandardMaterial({color:value,roughness:.95,metalness:0});
  else if (kind === "Glass") result = new THREE.MeshPhysicalMaterial({ color:value, roughness:Math.max(.012,r*.2), metalness:0, transmission:glassTransparency/100*.92, thickness:Math.max(.001,objectDepth), ior:glassIor, dispersion:.015, transparent:alpha<1, opacity:alpha, clearcoat:.25, clearcoatRoughness:.04, envMapIntensity:1.25, attenuationColor:value, attenuationDistance:2, side:THREE.DoubleSide });
  else if (kind === "Metal") result = new THREE.MeshStandardMaterial({ color:value, roughness:Math.max(.12,r), metalness:.88 });
  else if (kind === "Chrome") result = new THREE.MeshPhysicalMaterial({ color:new THREE.Color("#f3f5f7"), roughness:Math.max(.025,r*.22), metalness:1, clearcoat:1, clearcoatRoughness:.02, envMapIntensity:2.8 });
  else if (shaderPresets.includes(kind as ShaderPreset)) result = createShaderMaterial(kind as ShaderPreset,value,Math.max(.06,r));
  else if (customMaterialUrl) {
    const map=loadTexture(customMaterialUrl,true);
    map.repeat.set(repeat,repeat);map.center.set(.5,.5);map.rotation=THREE.MathUtils.degToRad(rotation);map.needsUpdate=true;
    const textureColor=new THREE.Color("#ffffff").lerp(value,tint/100);
    result=new THREE.MeshStandardMaterial({color:textureColor,map,roughness:Math.max(.45,r),metalness:0});
  }
  else if (textureAssets[kind]) {
    const [diffuseUrl, normalUrl, roughnessUrl] = textureAssets[kind];
    const map = loadTexture(diffuseUrl, true);
    const normalMap = normalStrength>0?loadTexture(normalUrl):undefined;
    const roughnessMap=roughnessUrl?loadTexture(roughnessUrl):undefined;
    const effectiveRepeat=kind==="Rubber"?repeat*.5:repeat;
    [map, normalMap, roughnessMap].filter(Boolean).forEach((texture) => { texture!.repeat.set(effectiveRepeat, effectiveRepeat); texture!.center.set(.5, .5); texture!.rotation = THREE.MathUtils.degToRad(rotation); texture!.needsUpdate = true; });
    const textureRoughness = kind === "Marble" ? .34 : kind === "Leather" ? .58 : kind === "Rubber" ? .9 : .78;
    const textureColor = new THREE.Color("#ffffff").lerp(value, tint / 100);
    const normalScale=Math.max(0,normalStrength/100)*(kind==="Rubber"?1.2:1);
    result = new THREE.MeshStandardMaterial({ color:textureColor, map, normalMap:normalMap??null, roughnessMap:roughnessMap??null, normalScale:new THREE.Vector2(normalScale,normalScale), roughness:Math.max(textureRoughness,r), metalness:0 });
  }
  else if (kind === "Clay") result = new THREE.MeshStandardMaterial({ color:value, roughness:Math.max(.82,r), metalness:0 });
  else result = new THREE.MeshPhysicalMaterial({ color:value, roughness:Math.max(.06,r*.7), metalness:.04, clearcoat:1, clearcoatRoughness:.08 });
  if(kind!=="Glass"){result.opacity=alpha;result.transparent=alpha<.999;result.depthWrite=alpha>.96;}
  if(kind!=="Glass")result.side = THREE.DoubleSide;
  if(triplanar&&result instanceof THREE.MeshStandardMaterial&&result.map)useTriplanarMaps(result);
  if(bounds&&appearance)applyColorGradient(result,bounds,color,appearance);
  result.shadowSide = THREE.DoubleSide;
  return result;
}

function presetBackground(name: string,fill?:BackgroundFill) {
  if (name === "None") return null;
  if (name.startsWith("blob:")||name.startsWith("data:image/")) { const texture = new THREE.TextureLoader().load(name); texture.colorSpace = THREE.SRGBColorSpace; return texture; }
  const canvas = document.createElement("canvas"); canvas.width=1024; canvas.height=1024; const ctx=canvas.getContext("2d")!;
  if(name==="Fill"&&fill){paintBackgroundFill(ctx,fill);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;}
  const gradients=backgroundPresets;
  const colors=gradients[name]??gradients.Noir; const gradient=ctx.createLinearGradient(0,0,1024,1024); gradient.addColorStop(0,colors[0]); gradient.addColorStop(1,colors[1]); ctx.fillStyle=gradient; ctx.fillRect(0,0,1024,1024);
  if(name==="Gallery"){ctx.fillStyle="rgba(255,255,255,.22)";for(let x=0;x<1024;x+=128)ctx.fillRect(x,0,1,1024);}
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; return texture;
}

function installGeometry(runtime:Runtime,geometry:THREE.BufferGeometry,current:StageProps) {
      runtime.model.traverse(child=>{if(child instanceof THREE.Mesh){child.geometry.dispose();(child.material as THREE.Material).dispose();if(child instanceof THREE.InstancedMesh)child.dispose();}});runtime.model.clear();
      const mesh=new THREE.Mesh(geometry,makeMaterial(current.material,current.color,current.roughness,current.textureRepeat,current.textureRotation,current.textureTint,current.normalStrength,current.colorOpacity,current.glassIor,current.glassTransparency,current.customMaterialUrl,geometry.boundingBox!.max.z-geometry.boundingBox!.min.z,current.geometryMode==="Inflate",geometry.boundingBox!,current));mesh.castShadow=current.material!=="Glass";mesh.receiveShadow=false;runtime.model.add(mesh);if(current.material==="Fur")addFurShells(mesh,current.color,current.colorOpacity/100,current.furLength??35,current.furDensity??120,current);current.onReady?.(Math.round(geometry.getAttribute("position").count/3));
}

export const ThreeStage = forwardRef<StageHandle, StageProps>(function ThreeStage(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tetherRef=useRef<SVGSVGElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const physicsRef=useRef<ModelPhysics|null>(null);
  const latestPropsRef = useRef(props);
  latestPropsRef.current = props;

  useImperativeHandle(ref, () => ({
    setCamera(kind,value) { const runtime=runtimeRef.current;if(!runtime)return;setCameraView(runtime.camera,runtime.controls.target,kind,value);runtime.controls.update();latestPropsRef.current.onCameraChange?.(getCameraView(runtime.camera,runtime.controls.target)); },
    reset() {
      const runtime = runtimeRef.current; if (!runtime) return;
      runtime.autoRotate=false;
      runtime.model.rotation.set(0,0,0);runtime.model.position.set(0,0,0);physicsRef.current=null;
      runtime.camera.position.set(0, 0, 5.4);
      runtime.camera.fov=36;runtime.camera.updateProjectionMatrix();
      latestPropsRef.current.onCameraChange?.({zoom:1,focalLength:Math.round(runtime.camera.getFocalLength())});
      runtime.controls.target.set(0, 0, 0); runtime.controls.update();
      latestPropsRef.current.onRotationChange?.({x:0,y:0,z:0});
    },
    center(){
      const runtime=runtimeRef.current;if(!runtime)return;
      runtime.autoRotate=false;
      const offset=runtime.camera.position.clone().sub(runtime.controls.target);
      runtime.controls.target.set(0,0,0);runtime.camera.position.copy(offset);runtime.controls.update();
    },
    rotate(axis, amount = 15) { physicsRef.current=null;const runtime = runtimeRef.current; if (runtime) {runtime.autoRotate=false;runtime.model.rotation[axis] += THREE.MathUtils.degToRad(amount);latestPropsRef.current.onRotationChange?.({x:THREE.MathUtils.radToDeg(runtime.model.rotation.x),y:THREE.MathUtils.radToDeg(runtime.model.rotation.y),z:THREE.MathUtils.radToDeg(runtime.model.rotation.z)});}},
    setRotation(axis,degrees){physicsRef.current=null;const runtime=runtimeRef.current;if(runtime){runtime.autoRotate=false;runtime.model.rotation[axis]=THREE.MathUtils.degToRad(degrees);latestPropsRef.current.onRotationChange?.({x:THREE.MathUtils.radToDeg(runtime.model.rotation.x),y:THREE.MathUtils.radToDeg(runtime.model.rotation.y),z:THREE.MathUtils.radToDeg(runtime.model.rotation.z)});}},
    exportPng(name, withBackground = false) {
      const runtime = runtimeRef.current; if (!runtime) return;
      const host = runtime.renderer.domElement.parentElement!;
      const { width, height } = host.getBoundingClientRect();
      const oldBackground=runtime.scene.background;
      runtime.exporting=true;
      runtime.renderer.setSize(1400, 1400, false);
      runtime.camera.aspect = 1;
      runtime.camera.updateProjectionMatrix();
      const ascii=latestPropsRef.current.effect==="ASCII";
      const output=ascii?document.createElement("canvas"):runtime.renderer.domElement;
      if(ascii){const current=latestPropsRef.current;renderAscii(runtime,1400,1400,withBackground?"opaque":"transparent",current.asciiGlyphs,output,current.asciiCharacters);}
      else{
        const current=latestPropsRef.current;
        runtime.scene.background=withBackground?(oldBackground??new THREE.Color("#080808")):null;
        runtime.composer.setSize(1400,1400);
        const exportDrawing=runtime.renderer.getDrawingBufferSize(new THREE.Vector2());
        runtime.backgroundTarget.setSize(exportDrawing.x,exportDrawing.y);
        if(current.effect==="None")runtime.renderer.render(runtime.scene,runtime.camera);else renderWithEffects(runtime,current,withBackground);
      }
      output.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${name}.png`);
        runtime.renderer.setSize(width, height, false);
        runtime.composer.setSize(width,height);
        const restoredDrawing=runtime.renderer.getDrawingBufferSize(new THREE.Vector2());
        runtime.backgroundTarget.setSize(restoredDrawing.x,restoredDrawing.y);
        runtime.camera.aspect = width / Math.max(1, height);
        runtime.camera.updateProjectionMatrix();
        runtime.scene.background=oldBackground;
        runtime.exporting=false;
      }, "image/png");
    },
    exportObj(name) {
      const runtime = runtimeRef.current; if (!runtime) return;
      const exportModel=runtime.model.clone();exportModel.traverse(child=>{if(child.userData.furShell)child.removeFromParent();});
      const text = new OBJExporter().parse(exportModel);
      downloadBlob(new Blob([text], { type:"text/plain" }), `${name}.obj`);
    },
    exportTxt(name) {
      const runtime=runtimeRef.current;if(!runtime)return;
      const host=runtime.renderer.domElement.parentElement!;
      const {width,height}=host.getBoundingClientRect();
      const current=latestPropsRef.current;
      const text=renderAscii(runtime,width,height,"transparent",current.asciiGlyphs,document.createElement("canvas"),current.asciiCharacters);
      downloadBlob(new Blob([`${text}\n`],{type:"text/plain;charset=utf-8"}),`${name}.txt`);
    },
  }));

  const {source:shapeSource,fileName:shapeFileName,text:shapeText,fontUrl:shapeFontUrl,fontWeight:shapeFontWeight,letterSpacing:shapeLetterSpacing,lineSpacing:shapeLineSpacing,geometryMode:shapeGeometryMode,thickness:shapeThickness,segments:shapeSegments,surfaceDetail:shapeSurfaceDetail,edge:shapeEdge,mass:shapeMass,revolveAngle:shapeRevolveAngle,revolveEdge:shapeRevolveEdge,inflateAmount:shapeInflateAmount,inflateDirection:shapeInflateDirection,bend:shapeBend,bulge:shapeBulge,taper:shapeTaper,twist:shapeTwist,onLoading:onShapeLoading,onError:onShapeError}=props;

  useEffect(() => {
    const host = hostRef.current!;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
    camera.position.set(0,0,latestPropsRef.current.demoSpin?6.15:5.4);
    const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const composer=new EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    const effectPass=new ShaderPass(postEffectShader);
    const compositePass=addEffectPipeline(composer,scene,camera,effectPass);
    const backgroundTarget=new THREE.WebGLRenderTarget(1,1,{format:THREE.RGBAFormat,type:THREE.HalfFloatType});
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    pmrem.dispose();
    host.appendChild(renderer.domElement);
    const asciiCanvas=document.createElement("canvas");
    asciiCanvas.className="ascii-output";
    asciiCanvas.setAttribute("aria-label","Real-time ASCII render");
    host.appendChild(asciiCanvas);
    const asciiSample=document.createElement("canvas");
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .075; controls.enableRotate=false; controls.enablePan = true; controls.screenSpacePanning=true; controls.minDistance = .1; controls.maxDistance = 120; controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;
    controls.addEventListener("change",()=>latestPropsRef.current.onCameraChange?.(getCameraView(camera,controls.target)));
    const model = new THREE.Group(); model.rotation.set(0,0,0); scene.add(model);
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
    runtimeRef.current = { exporting:false,scene, camera, renderer, composer, effectPass, compositePass, backgroundTarget, controls, model, key, fill, ambient, shadowFloor, worker, requestId:0, asciiCanvas, asciiSample, asciiLastFrame:0, autoRotate:Boolean(latestPropsRef.current.demoSpin), lastRotationEmit:0 };
    let rotating=false,lastPointerX=0,lastPointerY=0,grabbed=false;
    const grabLocal=new THREE.Vector3(),grabScreen=new THREE.Vector3();
    const tether=tetherRef.current!,tetherLine=tether.querySelector("line")!,tetherCircle=tether.querySelector("circle")!;
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),dragPlane=new THREE.Plane(),hitPoint=new THREE.Vector3();
    const pointRay=(event:PointerEvent)=>{const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);};
    const emitRotation=(time=performance.now())=>{const runtime=runtimeRef.current;if(!runtime||time-runtime.lastRotationEmit<40)return;runtime.lastRotationEmit=time;latestPropsRef.current.onRotationChange?.({x:Math.round(THREE.MathUtils.radToDeg(model.rotation.x)*10)/10,y:Math.round(THREE.MathUtils.radToDeg(model.rotation.y)*10)/10,z:Math.round(THREE.MathUtils.radToDeg(model.rotation.z)*10)/10});};
    const pointerDown=(event:PointerEvent)=>{
      if(event.button!==0)return;
      runtimeRef.current!.autoRotate=false;
      pointRay(event);const hit=raycaster.intersectObject(model,true)[0];
      grabbed=Boolean(hit);if(hit){grabLocal.copy(hit.point);model.worldToLocal(grabLocal);}
      if(latestPropsRef.current.gravity){
        if(!hit)return;
        dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),hit.point);
        if(!physicsRef.current)return;physicsRef.current.grab(hit.point);
      }else rotating=true;
      lastPointerX=event.clientX;lastPointerY=event.clientY;renderer.domElement.setPointerCapture(event.pointerId);
    };
    const pointerMove=(event:PointerEvent)=>{
      if(latestPropsRef.current.gravity){
        if(!physicsRef.current?.dragging)return;pointRay(event);
        if(raycaster.ray.intersectPlane(dragPlane,hitPoint))physicsRef.current.dragTo(hitPoint);
        return;
      }
      if(!rotating)return;pointRay(event);const dx=event.clientX-lastPointerX,dy=event.clientY-lastPointerY;lastPointerX=event.clientX;lastPointerY=event.clientY;model.rotation.y+=dx*.008;model.rotation.x+=dy*.008;emitRotation();
    };
    const pointerUp=(event:PointerEvent)=>{if(event.button===0||event.type==="pointercancel"||event.type==="lostpointercapture"){rotating=false;grabbed=false;tether.style.display="none";physicsRef.current?.release();}};
    const stopAuto=()=>{if(runtimeRef.current)runtimeRef.current.autoRotate=false;};
    renderer.domElement.addEventListener("pointerdown",pointerDown);
    renderer.domElement.addEventListener("pointermove",pointerMove);
    renderer.domElement.addEventListener("pointerup",pointerUp);
    renderer.domElement.addEventListener("pointercancel",pointerUp);
    renderer.domElement.addEventListener("lostpointercapture",pointerUp);
    renderer.domElement.addEventListener("wheel",stopAuto,{passive:true});
    renderer.domElement.addEventListener("contextmenu",event=>event.preventDefault());
    worker.onmessage=(event)=>{
      const runtime=runtimeRef.current;if(!runtime||event.data.id!==runtime.requestId)return;
      latestPropsRef.current.onLoading?.(false);
      if(event.data.error)return;
      const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.BufferAttribute(event.data.position,3));geometry.setAttribute("normal",new THREE.BufferAttribute(event.data.normal,3));if(event.data.uv.length)geometry.setAttribute("uv",new THREE.BufferAttribute(event.data.uv,2));geometry.computeBoundingBox();geometry.computeBoundingSphere();
      installGeometry(runtime,geometry,latestPropsRef.current);
    };
    const resize = () => { const { width, height } = host.getBoundingClientRect(); renderer.setSize(width, height, false);composer.setSize(width,height);const drawing=renderer.getDrawingBufferSize(new THREE.Vector2());backgroundTarget.setSize(drawing.x,drawing.y); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); latestPropsRef.current.onCameraChange?.(getCameraView(camera,controls.target)); };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    let frame = 0;const demoStart=performance.now();let lastPhysicsTime=demoStart;
    const loop = (time=0) => {
      controls.update();
      const runtime=runtimeRef.current;
      if(!runtime)return;
      if(runtime.exporting){frame=requestAnimationFrame(loop);return;}
      const dt=(time-lastPhysicsTime)/1000;lastPhysicsTime=time;
      if(latestPropsRef.current.gravity&&model.children.length){
        runtime.autoRotate=false;
        const mesh=model.children.find(child=>child instanceof THREE.Mesh) as THREE.Mesh|undefined;
        if(mesh){if(physicsRef.current?.geometry!==mesh.geometry)physicsRef.current=new ModelPhysics(mesh.geometry,model,shadowFloor.position.y);physicsRef.current.step(dt);emitRotation(time);}
      }
      const showTether=grabbed&&(rotating||(latestPropsRef.current.gravity&&physicsRef.current?.dragging));
      tether.style.display=showTether?"block":"none";
      if(showTether){
        model.updateMatrixWorld(true);grabScreen.copy(grabLocal).applyMatrix4(model.matrixWorld).project(camera);
        const width=renderer.domElement.clientWidth,height=renderer.domElement.clientHeight,cursorX=(pointer.x+1)*width/2,cursorY=(1-pointer.y)*height/2;
        tetherCircle.setAttribute("cx",String(cursorX));tetherCircle.setAttribute("cy",String(cursorY));
        tetherLine.setAttribute("x1",String(cursorX));tetherLine.setAttribute("y1",String(cursorY));
        tetherLine.setAttribute("x2",String((grabScreen.x+1)*width/2));tetherLine.setAttribute("y2",String((1-grabScreen.y)*height/2));
      }
      model.traverse(child=>{if(child instanceof THREE.Mesh){const material=child.material as THREE.Material;if(material.userData.patternTime)material.userData.patternTime.value=time/1000;}});
      if(runtime.autoRotate&&latestPropsRef.current.demoSpin){model.rotation.y=Math.sin((time-demoStart)*.00045)*THREE.MathUtils.degToRad(18);emitRotation(time);}
      if(latestPropsRef.current.effect==="ASCII"){
        renderer.domElement.style.opacity="0";
        asciiCanvas.style.display="block";
        if(time-runtime.asciiLastFrame>42){
          const {width,height}=host.getBoundingClientRect();
          const current=latestPropsRef.current;
          renderAscii(runtime,width,height,"scene",current.asciiGlyphs,runtime.asciiCanvas,current.asciiCharacters);
          runtime.asciiLastFrame=time;
        }
      }else{
        renderer.domElement.style.opacity="1";
        asciiCanvas.style.display="none";
        const current=latestPropsRef.current;
        if(current.effect==="None")renderer.render(scene,camera);else renderWithEffects(runtime,current,true);
      }
      frame=requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(frame);model.children.forEach(child=>{if(child instanceof THREE.Mesh)removeFurShells(child);}); observer.disconnect(); worker.terminate(); controls.dispose();renderer.domElement.removeEventListener("pointerdown",pointerDown);renderer.domElement.removeEventListener("pointermove",pointerMove);renderer.domElement.removeEventListener("pointerup",pointerUp);renderer.domElement.removeEventListener("pointercancel",pointerUp);renderer.domElement.removeEventListener("lostpointercapture",pointerUp);renderer.domElement.removeEventListener("wheel",stopAuto);backgroundTarget.dispose();composer.dispose();renderer.dispose(); host.removeChild(renderer.domElement);host.removeChild(asciiCanvas);runtimeRef.current = null; };
  }, []);

  useEffect(()=>{
    physicsRef.current=null;
    if(runtimeRef.current)runtimeRef.current.autoRotate=false;
  },[props.gravity]);
  useEffect(()=>{if(runtimeRef.current)runtimeRef.current.model.position.set(0,0,0);physicsRef.current=null;},[props.source,props.text]);

  useEffect(() => {
    let cancelled = false;
    const build = async () => {
      const runtime = runtimeRef.current; if (!runtime) return;
      const requestId=++runtime.requestId;
      if(shapeSource&&/\.(obj|stl)$/i.test(shapeFileName)) {
        onShapeLoading?.(true);
        try {
          const response=await fetch(shapeSource);
          if(!response.ok)throw new Error("Could not read model");
          const geometry=parseModel(await response.arrayBuffer(),shapeFileName);
          if(cancelled||runtimeRef.current!==runtime||runtime.requestId!==requestId){geometry.dispose();return;}
          runtime.autoRotate=false;installGeometry(runtime,geometry,latestPropsRef.current);
        }catch(error){if(!cancelled)onShapeError?.(error instanceof Error?error.message:"Could not load model");}
        finally{if(!cancelled)onShapeLoading?.(false);}
        return;
      }
      let shapes: THREE.Shape[];
      try { shapes = shapeText?.trim()&&shapeFontUrl ? await textShapes(shapeText,shapeFontUrl,shapeFontWeight,shapeLetterSpacing,shapeLineSpacing) : shapeSource ? (shapeFileName.toLowerCase().endsWith(".svg") ? await svgShapes(shapeSource) : await pngShapes(shapeSource, 48 + shapeSegments * 18)) : [polygonShape(demoPoints)]; }
      catch (error) {
        console.error("Shape generation failed", error);
        onShapeLoading?.(false);
        onShapeError?.(error instanceof Error ? error.message : "Could not generate this shape");
        return;
      }
      await new Promise(resolve=>window.setTimeout(resolve,70));
      if (cancelled || !runtimeRef.current) return;
      const deforming=Math.abs(shapeMass)+Math.abs(shapeBend)+Math.abs(shapeBulge)+Math.abs(shapeTaper)+Math.abs(shapeTwist)>0;
      const heavy=shapeGeometryMode!=="Extrude"||shapeSegments>=64||(deforming&&shapeSurfaceDetail>=3)||shapeMass>=70||shapeEdge>=180;onShapeLoading?.(heavy);
      // SVGLoader samples every curve separately, so a nominal value of 256
      // can otherwise create thousands of contour points per ring. Preserve
      // the requested visual detail while bounding the actual ring density.
      const curveSegments=shapeGeometryMode==="Inflate"?Math.max(shapeSegments,64+shapeSurfaceDetail*32):Math.max(3,shapeSegments);
      const ringLimit=Math.min(1024,Math.max(48,shapeGeometryMode==="Inflate"?curveSegments*4:48+shapeSegments));
      const sampled=shapes.map(shape=>({outer:limitRing(shape.getPoints(curveSegments),ringLimit).map(point=>[point.x,point.y]),holes:shape.holes.map(hole=>limitRing(hole.getPoints(curveSegments),ringLimit).map(point=>[point.x,point.y]))}));
      runtime.worker.postMessage({id:requestId,shapes:sampled,geometryMode:shapeGeometryMode,thickness:shapeThickness,segments:shapeSegments,surfaceDetail:shapeSurfaceDetail,edge:shapeEdge,mass:shapeMass,revolveAngle:shapeRevolveAngle,revolveEdge:shapeRevolveEdge,inflateAmount:shapeInflateAmount,inflateDirection:shapeInflateDirection,bend:shapeBend,bulge:shapeBulge,taper:shapeTaper,twist:shapeTwist});
    };
    build(); return () => { cancelled = true; };
  }, [shapeSource,shapeFileName,shapeText,shapeFontUrl,shapeFontWeight,shapeLetterSpacing,shapeLineSpacing,shapeGeometryMode,shapeThickness,shapeSegments,shapeSurfaceDetail,shapeEdge,shapeMass,shapeRevolveAngle,shapeRevolveEdge,shapeInflateAmount,shapeInflateDirection,shapeBend,shapeBulge,shapeTaper,shapeTwist,onShapeLoading,onShapeError]);

  useEffect(() => {
    const runtime = runtimeRef.current; if (!runtime) return;
    runtime.model.children.forEach((child) => { if (child instanceof THREE.Mesh) { removeFurShells(child);const old = child.material as THREE.Material; child.castShadow=props.material!=="Glass"; child.material = makeMaterial(props.material, props.color, props.roughness, props.textureRepeat, props.textureRotation, props.textureTint,props.normalStrength,props.colorOpacity,props.glassIor,props.glassTransparency,props.customMaterialUrl,child.geometry.boundingBox!.max.z-child.geometry.boundingBox!.min.z,props.geometryMode==="Inflate",child.geometry.boundingBox!,props);if(props.material==="Fur")addFurShells(child,props.color,props.colorOpacity/100,props.furLength??35,props.furDensity??120,props); old.dispose(); } });
  }, [props.furLength,props.furDensity,props.colorMode,props.gradientColor,props.gradientAngle,props.geometryMode,props.material,props.customMaterialUrl,props.color,props.roughness,props.textureRepeat,props.textureRotation,props.textureTint,props.normalStrength,props.colorOpacity,props.glassIor,props.glassTransparency]);

  useEffect(() => { const runtime = runtimeRef.current; if (runtime) { runtime.key.intensity = props.light / 18; runtime.fill.intensity = props.light / 30; runtime.ambient.intensity=props.ambientLight/45;runtime.key.position.set(props.lightX,props.lightY,props.lightZ);runtime.key.shadow.radius=THREE.MathUtils.mapLinear(props.shadowSoftness,0,100,1,12);(runtime.shadowFloor.material as THREE.ShadowMaterial).opacity=props.shadowOpacity/100;runtime.shadowFloor.visible=props.shadows; runtime.key.castShadow=props.shadows; } }, [props.light,props.lightX,props.lightY,props.lightZ,props.ambientLight,props.shadowSoftness,props.shadowOpacity,props.shadows]);

  useEffect(() => {
    const runtime=runtimeRef.current; if(!runtime)return;
    const old=runtime.scene.background; // Transmission needs an opaque scene background; CSS behind the canvas cannot refract.
    runtime.scene.background=presetBackground(props.background,props.backgroundFill)??(props.material==="Glass"?new THREE.Color("#080808"):null);
    if(old instanceof THREE.Texture && !Array.from(textureCache.values()).includes(old)) old.dispose();
  },[props.background,props.backgroundFill,props.material]);

  return <div ref={hostRef} className="webgl-stage" aria-label="Interactive WebGL 3D model"><svg ref={tetherRef} className="drag-tether" aria-hidden="true"><line/><circle r="13"/></svg></div>;
});

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

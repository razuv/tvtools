"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { parse as parseOpenType, type Font, type PathCommand } from "opentype.js";
import { EndType, FillRule, inflatePathsD, JoinType, simplifyPathD, unionD, type PathD } from "clipper2-ts";
import { createVgpuPostLayer } from "./vgpuPostLayer";
import { createVgpuMaterialLayer, type VgpuSceneMaterial } from "./vgpuMaterialLayer";
import { createVgpuTransmissionLayer } from "./vgpuTransmissionLayer";

export type StageHandle = {
  reset: () => void;
  center: () => void;
  rotate: (axis: "x" | "y" | "z", amount?: number) => void;
  setRotation: (axis: "x" | "y" | "z", degrees: number) => void;
  exportPng: (name: string, withBackground?: boolean) => void;
  exportObj: (name: string) => void;
  exportTxt: (name: string) => void;
};

type StageProps = {
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
  glassReflection: number;
  glassFrost: number;
  vgpuRayAngle: number;
  vgpuRayStrength: number;
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
  effectBackground: boolean;
  duotoneDarkColor: string;
  duotoneColor: string;
  background: string;
  onReady?: (triangles: number) => void;
  onLoading?: (loading: boolean) => void;
  onError?: (message: string) => void;
  onRotationChange?: (rotation: {x:number;y:number;z:number}) => void;
};

type Runtime = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  effectPass: ShaderPass;
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

const effectModes:Record<string,number>={None:0,Cartoon:1,Sketch:2,Halftone:3,Pixelate:4,Chromatic:5,Duotone:6,Dither:7,Glow:8};
const vgpuMaterials = new Set<VgpuSceneMaterial>(["VGPU Holographic", "VGPU Lava"]);
const vgpuEffectModes:Record<string,number>={"VGPU Bloom":1,"VGPU Filmic":2};
const postEffectShader={
  uniforms:{
    tDiffuse:{value:null},
    tBackground:{value:null},
    resolution:{value:new THREE.Vector2(1,1)},
    mode:{value:0},
    intensity:{value:1},
    compositeBackground:{value:0},
    expandCellAlpha:{value:0},
    duotoneDarkColor:{value:new THREE.Color("#090c13")},
    duotoneColor:{value:new THREE.Color("#ff7a45")},
    rayAngle:{value:35},
    rayStrength:{value:.85},
    time:{value:0},
  },
  vertexShader:`varying vec2 vUv;
    void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D tDiffuse;
    uniform sampler2D tBackground;
    uniform vec2 resolution;
    uniform float mode;
    uniform float intensity;
    uniform float compositeBackground;
    uniform float expandCellAlpha;
    uniform vec3 duotoneDarkColor;
    uniform vec3 duotoneColor;
    uniform float rayAngle;
    uniform float rayStrength;
    uniform float time;
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
        vec3 split=vec3(texture2D(tDiffuse,vUv+offset).r,base.g,texture2D(tDiffuse,vUv-offset).b);
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
      }else if(mode>7.5&&mode<8.5){
        vec2 t=1.0/max(resolution,vec2(1.0))*mix(2.0,8.0,amount);
        vec3 glow=texture2D(tDiffuse,vUv+vec2(t.x,0.0)).rgb+texture2D(tDiffuse,vUv-vec2(t.x,0.0)).rgb+texture2D(tDiffuse,vUv+vec2(0.0,t.y)).rgb+texture2D(tDiffuse,vUv-vec2(0.0,t.y)).rgb;
        result=base.rgb+glow*.12*amount;
      }else if(mode>8.5&&mode<9.5){
        float angle=radians(rayAngle);
        vec2 direction=normalize(vec2(cos(angle),sin(angle)*resolution.x/resolution.y));
        vec2 t=1.0/max(resolution,vec2(1.0));
        float ax=texture2D(tDiffuse,vUv+vec2(t.x*3.0,0.0)).a-texture2D(tDiffuse,vUv-vec2(t.x*3.0,0.0)).a;
        float ay=texture2D(tDiffuse,vUv+vec2(0.0,t.y*3.0)).a-texture2D(tDiffuse,vUv-vec2(0.0,t.y*3.0)).a;
        vec2 bend=(vec2(ax,ay)*.85+direction*.42)*(.012+rayStrength*.034)*amount;
        vec3 refracted=vec3(texture2D(tDiffuse,vUv+bend*1.25).r,texture2D(tDiffuse,vUv+bend).g,texture2D(tDiffuse,vUv+bend*.68).b);
        float rim=smoothstep(.01,.55,length(vec2(ax,ay)));
        result=mix(base.rgb,refracted,.82*amount)+vec3(.12,.45,1.0)*rim*amount;
      }else if(mode>9.5&&mode<10.5){
        vec2 t=1.0/max(resolution,vec2(1.0));
        vec4 glow=vec4(0.0);
        glow+=texture2D(tDiffuse,vUv+vec2(t.x*7.0,0.0));glow+=texture2D(tDiffuse,vUv-vec2(t.x*7.0,0.0));
        glow+=texture2D(tDiffuse,vUv+vec2(0.0,t.y*7.0));glow+=texture2D(tDiffuse,vUv-vec2(0.0,t.y*7.0));
        glow+=texture2D(tDiffuse,vUv+vec2(t.x*18.0,t.y*12.0));glow+=texture2D(tDiffuse,vUv-vec2(t.x*18.0,t.y*12.0));
        glow*=.1667;result=base.rgb+max(glow.rgb-vec3(.18),vec3(0.0))*3.8*amount;outputAlpha=max(base.a,glow.a*.72*amount);
      }else if(mode>10.5&&mode<11.5){
        float lightness=luma(base.rgb);vec3 contrast=smoothstep(vec3(.025),vec3(.94),base.rgb);
        vec3 graded=contrast+vec3(.02,.12,.16)*(1.0-lightness)+vec3(.18,.07,.015)*lightness;
        float vignette=smoothstep(.88,.2,length((vUv-.5)*vec2(1.0,resolution.y/resolution.x)));
        float grain=fract(sin(dot(vUv*resolution+time,vec2(12.9898,78.233)))*43758.5453)-.5;
        result=mix(base.rgb,pow(max(graded,vec3(0.0)),vec3(.88))*mix(.68,1.06,vignette)+grain*.045,amount);
      }else if(mode>12.5&&mode<13.5){
        float sweep=dot(vUv,vec2(.78,.62))*6.0+sin(vUv.y*8.0-time*.18)*.45;
        vec3 foil=.66+.34*cos(6.28318*(sweep+vec3(0.0,.31,.63)));
        float silk=.82+.18*sin((vUv.x-vUv.y)*75.0+time*.35);
        result=mix(base.rgb,mix(vec3(.78,.84,.86),foil,.62)*silk,.88*amount);
      }else if(mode>13.5&&mode<14.5){
        float n=sin(vUv.x*19.0+sin(vUv.y*13.0+time*.8))*sin(vUv.y*17.0-time*.55);
        float hot=smoothstep(-.15,.82,n);
        vec3 lava=mix(vec3(.025,.002,.001),vec3(.78,.025,.0),smoothstep(-.5,.35,n));
        lava=mix(lava,vec3(1.0,.82,.08),pow(hot,3.0));
        result=mix(base.rgb,lava,amount);
      }
      vec4 outputColor=vec4(result,outputAlpha);
      if(compositeBackground>.5){
        vec4 background=texture2D(tBackground,vUv);
        outputColor=vec4(outputColor.rgb*outputColor.a+background.rgb*(1.0-outputColor.a),outputColor.a+background.a*(1.0-outputColor.a));
      }
gl_FragColor=outputColor;
    }`,
  };

function renderWithEffects(runtime:Runtime,props:StageProps,includeBackground=true,time=0){
  runtime.effectPass.uniforms.mode.value=effectModes[props.effect]??0;
  runtime.effectPass.uniforms.intensity.value=props.effectIntensity/100;
  runtime.effectPass.uniforms.duotoneDarkColor.value.set(props.duotoneDarkColor);
  runtime.effectPass.uniforms.duotoneColor.value.set(props.duotoneColor);
  runtime.effectPass.uniforms.rayAngle.value=props.vgpuRayAngle;
  runtime.effectPass.uniforms.rayStrength.value=props.vgpuRayStrength/100;
  runtime.effectPass.uniforms.time.value=time/1000;
  runtime.effectPass.uniforms.resolution.value.set(runtime.renderer.domElement.width,runtime.renderer.domElement.height);
  const isolateModel=!includeBackground||!props.effectBackground;
  runtime.effectPass.uniforms.expandCellAlpha.value=isolateModel?1:0;
  if(isolateModel){
    const background=runtime.scene.background;
    const modelVisible=runtime.model.visible;
    const floorVisible=runtime.shadowFloor.visible;
    if(includeBackground){
      runtime.model.visible=false;runtime.shadowFloor.visible=false;
      runtime.renderer.setRenderTarget(runtime.backgroundTarget);
      runtime.renderer.clear();runtime.renderer.render(runtime.scene,runtime.camera);
      runtime.renderer.setRenderTarget(null);
      runtime.effectPass.uniforms.tBackground.value=runtime.backgroundTarget.texture;
      runtime.effectPass.uniforms.compositeBackground.value=1;
    }else runtime.effectPass.uniforms.compositeBackground.value=0;
    runtime.scene.background=null;runtime.model.visible=modelVisible;runtime.shadowFloor.visible=false;
    runtime.composer.render();
    runtime.scene.background=background;runtime.shadowFloor.visible=floorVisible;
    return;
  }
  runtime.effectPass.uniforms.compositeBackground.value=0;
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

function makeMaterial(kind: string, color: string, roughness: number, repeat: number, rotation: number, tint: number, normalStrength: number, colorOpacity: number, glassIor: number, glassTransparency: number, glassReflection: number, glassFrost: number, customMaterialUrl?:string) {
  const value = new THREE.Color(color);
  const r = roughness / 100;
  const alpha = colorOpacity / 100;
  const reflection = glassReflection / 100;
  const frost = glassFrost / 100;
  let result: THREE.Material;
  if (kind === "Glass") result = new THREE.MeshPhysicalMaterial({ color:value, roughness:Math.max(.012,frost*.82+r*.16), metalness:0, transmission:(glassTransparency/100)*(1-frost*.18), thickness:1.8, ior:glassIor, dispersion:.035*(1-frost), transparent:true, opacity:alpha, reflectivity:reflection, clearcoat:reflection, clearcoatRoughness:.02+frost*.5, envMapIntensity:.25+reflection*3.2, attenuationColor:value, attenuationDistance:2.5+frost*2 });
  else if (kind === "VGPU Glass") result = new THREE.MeshPhysicalMaterial({color:value,roughness:Math.max(.008,frost*.72+r*.12),metalness:0,transmission:Math.max(.68,glassTransparency/100)*(1-frost*.14),thickness:2.8,ior:glassIor,dispersion:.1*(1-frost*.55),transparent:true,opacity:alpha,reflectivity:reflection,clearcoat:reflection,clearcoatRoughness:.008+frost*.42,envMapIntensity:.4+reflection*3.8,attenuationColor:value,attenuationDistance:3.8});
  else if (kind === "VGPU Holographic") result = new THREE.MeshPhysicalMaterial({color:new THREE.Color("#eef4f5").lerp(value,.12),roughness:.14,metalness:.62,iridescence:1,iridescenceIOR:1.72,iridescenceThicknessRange:[160,860],clearcoat:1,clearcoatRoughness:.045,envMapIntensity:2.8});
  else if (kind === "VGPU Lava") result = new THREE.MeshStandardMaterial({color:new THREE.Color("#ff3b08"),roughness:.58,metalness:.04,emissive:new THREE.Color("#9c0800"),emissiveIntensity:1.5});
  else if (kind === "Metal") result = new THREE.MeshStandardMaterial({ color:value, roughness:Math.max(.12,r), metalness:.88 });
  else if (kind === "Chrome") result = new THREE.MeshPhysicalMaterial({ color:new THREE.Color("#f3f5f7"), roughness:Math.max(.025,r*.22), metalness:1, clearcoat:1, clearcoatRoughness:.02, envMapIntensity:2.8 });
  else if (kind === "ASCII") result = new THREE.MeshStandardMaterial({ color:value, roughness:Math.max(.16,r), metalness:.08 });
  else if (customMaterialUrl) {
    const map=loadTexture(customMaterialUrl,true);
    map.repeat.set(repeat,repeat);map.center.set(.5,.5);map.rotation=THREE.MathUtils.degToRad(rotation);map.needsUpdate=true;
    const textureColor=new THREE.Color("#ffffff").lerp(value,tint/100);
    result=new THREE.MeshStandardMaterial({color:textureColor,map,roughness:Math.max(.45,r),metalness:0});
  }
  else if (textureAssets[kind]) {
    const [diffuseUrl, normalUrl, roughnessUrl] = textureAssets[kind];
    const map = loadTexture(diffuseUrl, true);
    const normalMap = loadTexture(normalUrl);
    const roughnessMap=roughnessUrl?loadTexture(roughnessUrl):undefined;
    const effectiveRepeat=kind==="Rubber"?repeat*.5:repeat;
    [map, normalMap, roughnessMap].filter(Boolean).forEach((texture) => { texture!.repeat.set(effectiveRepeat, effectiveRepeat); texture!.center.set(.5, .5); texture!.rotation = THREE.MathUtils.degToRad(rotation); texture!.needsUpdate = true; });
    const textureRoughness = kind === "Marble" ? .34 : kind === "Leather" ? .58 : kind === "Rubber" ? .9 : .78;
    const textureColor = new THREE.Color("#ffffff").lerp(value, tint / 100);
    const normalScale=Math.max(0,normalStrength/100)*(kind==="Rubber"?1.2:1);
    result = new THREE.MeshStandardMaterial({ color:textureColor, map, normalMap, roughnessMap, normalScale:new THREE.Vector2(normalScale,normalScale), roughness:Math.max(textureRoughness,r), metalness:0 });
  }
  else if (kind === "Clay") result = new THREE.MeshStandardMaterial({ color:value, roughness:Math.max(.82,r), metalness:0 });
  else result = new THREE.MeshPhysicalMaterial({ color:value, roughness:Math.max(.06,r*.7), metalness:.04, clearcoat:1, clearcoatRoughness:.08 });
  if(kind!=="Glass" && kind!=="VGPU Glass"){result.opacity=alpha;result.transparent=alpha<.999;result.depthWrite=alpha>.96;}
  result.side = THREE.DoubleSide;
  result.shadowSide = THREE.DoubleSide;
  return result;
}

function presetBackground(name: string) {
  if (name === "None") return null;
  if (name.startsWith("blob:")||name.startsWith("data:image/")) { const texture = new THREE.TextureLoader().load(name); texture.colorSpace = THREE.SRGBColorSpace; return texture; }
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
      runtime.autoRotate=false;
      runtime.model.rotation.set(0,0,0);
      runtime.camera.position.set(0, 0, 5.4);
      runtime.controls.target.set(0, 0, 0); runtime.controls.update();
      latestPropsRef.current.onRotationChange?.({x:0,y:0,z:0});
    },
    center(){
      const runtime=runtimeRef.current;if(!runtime)return;
      runtime.autoRotate=false;
      const offset=runtime.camera.position.clone().sub(runtime.controls.target);
      runtime.controls.target.set(0,0,0);runtime.camera.position.copy(offset);runtime.controls.update();
    },
    rotate(axis, amount = 15) { const runtime = runtimeRef.current; if (runtime) {runtime.autoRotate=false;runtime.model.rotation[axis] += THREE.MathUtils.degToRad(amount);latestPropsRef.current.onRotationChange?.({x:THREE.MathUtils.radToDeg(runtime.model.rotation.x),y:THREE.MathUtils.radToDeg(runtime.model.rotation.y),z:THREE.MathUtils.radToDeg(runtime.model.rotation.z)});}},
    setRotation(axis,degrees){const runtime=runtimeRef.current;if(runtime){runtime.autoRotate=false;runtime.model.rotation[axis]=THREE.MathUtils.degToRad(degrees);latestPropsRef.current.onRotationChange?.({x:THREE.MathUtils.radToDeg(runtime.model.rotation.x),y:THREE.MathUtils.radToDeg(runtime.model.rotation.y),z:THREE.MathUtils.radToDeg(runtime.model.rotation.z)});}},
    exportPng(name, withBackground = false) {
      const runtime = runtimeRef.current; if (!runtime) return;
      const host = runtime.renderer.domElement.parentElement!;
      const { width, height } = host.getBoundingClientRect();
      const oldBackground=runtime.scene.background;
      runtime.renderer.setSize(1400, 1400, false);
      runtime.camera.aspect = 1;
      runtime.camera.updateProjectionMatrix();
      const ascii=latestPropsRef.current.material==="ASCII";
      const output=ascii?document.createElement("canvas"):runtime.renderer.domElement;
      if(ascii){const current=latestPropsRef.current;renderAscii(runtime,1400,1400,withBackground?"opaque":"transparent",current.asciiGlyphs,output,current.asciiCharacters);}
      else{
        const current=latestPropsRef.current;
        runtime.scene.background=withBackground?(oldBackground??new THREE.Color("#080808")):null;
        runtime.composer.setSize(1400,1400);
        const exportDrawing=runtime.renderer.getDrawingBufferSize(new THREE.Vector2());
        runtime.backgroundTarget.setSize(exportDrawing.x,exportDrawing.y);
        if(current.effect==="None"||vgpuEffectModes[current.effect]!==undefined)runtime.renderer.render(runtime.scene,runtime.camera);else renderWithEffects(runtime,current,withBackground,performance.now());
      }
      const finish=(finalOutput:HTMLCanvasElement)=>finalOutput.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${name}.png`);
        runtime.renderer.setSize(width, height, false);
        runtime.composer.setSize(width,height);
        const restoredDrawing=runtime.renderer.getDrawingBufferSize(new THREE.Vector2());
        runtime.backgroundTarget.setSize(restoredDrawing.x,restoredDrawing.y);
        runtime.camera.aspect = width / Math.max(1, height);
        runtime.camera.updateProjectionMatrix();
        runtime.scene.background=oldBackground;
      }, "image/png");
      finish(output);
    },
    exportObj(name) {
      const runtime = runtimeRef.current; if (!runtime) return;
      const text = new OBJExporter().parse(runtime.model);
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
    const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true } as THREE.WebGLRendererParameters & { samples?: number });
    (renderer as any).samples = 4;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const composer=new EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.addPass(new RenderPass(scene,camera));
    const effectPass=new ShaderPass(postEffectShader);
    composer.addPass(effectPass);
    composer.addPass(new OutputPass());
    const backgroundTarget=new THREE.WebGLRenderTarget(1,1,{format:THREE.RGBAFormat});
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    pmrem.dispose();
    host.appendChild(renderer.domElement);
    const vgpuMaterialCanvas=document.createElement("canvas");
    vgpuMaterialCanvas.className="vgpu-output vgpu-material-output";
    vgpuMaterialCanvas.setAttribute("aria-label","WebGPU material output");
    vgpuMaterialCanvas.style.visibility="hidden";
    host.appendChild(vgpuMaterialCanvas);
    const vgpuTransmissionCanvas=document.createElement("canvas");
    vgpuTransmissionCanvas.className="vgpu-output vgpu-transmission-output";
    vgpuTransmissionCanvas.setAttribute("aria-label","VGPU screen-space transmission output");
    vgpuTransmissionCanvas.style.visibility="hidden";
    host.appendChild(vgpuTransmissionCanvas);
    const vgpuPostCanvas=document.createElement("canvas");
    vgpuPostCanvas.className="vgpu-output vgpu-post-output";
    vgpuPostCanvas.setAttribute("aria-label","VGPU post-processing output");
    vgpuPostCanvas.style.visibility="hidden";
    host.appendChild(vgpuPostCanvas);
    let vgpuMaterialLayer:Awaited<ReturnType<typeof createVgpuMaterialLayer>>|null=null;
    let vgpuTransmissionLayer:Awaited<ReturnType<typeof createVgpuTransmissionLayer>>|null=null;
    let vgpuPostLayer:Awaited<ReturnType<typeof createVgpuPostLayer>>|null=null;
    let vgpuDisposed=false;
    const asciiCanvas=document.createElement("canvas");
    asciiCanvas.className="ascii-output";
    asciiCanvas.setAttribute("aria-label","Real-time ASCII render");
    host.appendChild(asciiCanvas);
    const asciiSample=document.createElement("canvas");
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .075; controls.enableRotate=false; controls.enablePan = true; controls.screenSpacePanning=true; controls.minDistance = .7; controls.maxDistance = 24; controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;
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
    runtimeRef.current = { scene, camera, renderer, composer, effectPass, backgroundTarget, controls, model, key, fill, ambient, shadowFloor, worker, requestId:0, asciiCanvas, asciiSample, asciiLastFrame:0, autoRotate:Boolean(latestPropsRef.current.demoSpin), lastRotationEmit:0 };
    let rotating=false,lastPointerX=0,lastPointerY=0;
    const emitRotation=(time=performance.now())=>{const runtime=runtimeRef.current;if(!runtime||time-runtime.lastRotationEmit<40)return;runtime.lastRotationEmit=time;latestPropsRef.current.onRotationChange?.({x:Math.round(THREE.MathUtils.radToDeg(model.rotation.x)*10)/10,y:Math.round(THREE.MathUtils.radToDeg(model.rotation.y)*10)/10,z:Math.round(THREE.MathUtils.radToDeg(model.rotation.z)*10)/10});};
    const pointerDown=(event:PointerEvent)=>{if(event.button!==0)return;rotating=true;lastPointerX=event.clientX;lastPointerY=event.clientY;runtimeRef.current!.autoRotate=false;renderer.domElement.setPointerCapture(event.pointerId);};
    const pointerMove=(event:PointerEvent)=>{if(!rotating)return;const dx=event.clientX-lastPointerX,dy=event.clientY-lastPointerY;lastPointerX=event.clientX;lastPointerY=event.clientY;model.rotation.y+=dx*.008;model.rotation.x+=dy*.008;emitRotation();};
    const pointerUp=(event:PointerEvent)=>{if(event.button===0)rotating=false;};
    const stopAuto=()=>{if(runtimeRef.current)runtimeRef.current.autoRotate=false;};
    renderer.domElement.addEventListener("pointerdown",pointerDown);
    renderer.domElement.addEventListener("pointermove",pointerMove);
    renderer.domElement.addEventListener("pointerup",pointerUp);
    renderer.domElement.addEventListener("pointercancel",pointerUp);
    renderer.domElement.addEventListener("wheel",stopAuto,{passive:true});
    renderer.domElement.addEventListener("contextmenu",event=>event.preventDefault());
    worker.onmessage=(event)=>{
      const runtime=runtimeRef.current;if(!runtime||event.data.id!==runtime.requestId)return;
      latestPropsRef.current.onLoading?.(false);
      if(event.data.error)return;
      const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.BufferAttribute(event.data.position,3));geometry.setAttribute("normal",new THREE.BufferAttribute(event.data.normal,3));if(event.data.uv.length)geometry.setAttribute("uv",new THREE.BufferAttribute(event.data.uv,2));geometry.computeBoundingBox();geometry.computeBoundingSphere();
      runtime.model.traverse(child=>{if(child instanceof THREE.Mesh){child.geometry.dispose();(child.material as THREE.Material).dispose();}});runtime.model.clear();
      const current=latestPropsRef.current;const mesh=new THREE.Mesh(geometry,makeMaterial(current.material,current.color,current.roughness,current.textureRepeat,current.textureRotation,current.textureTint,current.normalStrength,current.colorOpacity,current.glassIor,current.glassTransparency,current.glassReflection,current.glassFrost,current.customMaterialUrl));mesh.castShadow=true;mesh.receiveShadow=false;runtime.model.add(mesh);vgpuMaterialLayer?.setGeometry(geometry);vgpuTransmissionLayer?.setGeometry(geometry);current.onReady?.(Math.round(event.data.triangles));
    };
    const resize = () => { const { width, height } = host.getBoundingClientRect(); renderer.setSize(width, height, false);composer.setSize(width,height);const drawing=renderer.getDrawingBufferSize(new THREE.Vector2());backgroundTarget.setSize(drawing.x,drawing.y); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();vgpuMaterialLayer?.resize(width,height); };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    void createVgpuMaterialLayer(vgpuMaterialCanvas).then(layer=>{if(vgpuDisposed){layer.dispose();return;}vgpuMaterialLayer=layer;const {width,height}=host.getBoundingClientRect();layer.resize(width,height);const currentMesh=runtimeRef.current?.model.children.find(child=>child instanceof THREE.Mesh) as THREE.Mesh|undefined;if(currentMesh)layer.setGeometry(currentMesh.geometry);vgpuMaterialCanvas.dataset.ready="true";}).catch(error=>{vgpuMaterialCanvas.dataset.ready="false";console.warn("WebGPU material renderer unavailable; using the WebGL fallback.",error);});
    void createVgpuTransmissionLayer(renderer.domElement,vgpuTransmissionCanvas).then(layer=>{if(vgpuDisposed){layer.dispose();return;}vgpuTransmissionLayer=layer;const currentMesh=runtimeRef.current?.model.children.find(child=>child instanceof THREE.Mesh) as THREE.Mesh|undefined;if(currentMesh)layer.setGeometry(currentMesh.geometry);vgpuTransmissionCanvas.dataset.ready="true";}).catch(error=>{vgpuTransmissionCanvas.dataset.ready="false";console.warn("VGPU transmission unavailable; using the WebGL fallback.",error);});
    void createVgpuPostLayer(renderer.domElement,vgpuPostCanvas).then(layer=>{if(vgpuDisposed)layer.dispose();else{vgpuPostLayer=layer;vgpuPostCanvas.dataset.ready="true";}}).catch(error=>{vgpuPostCanvas.dataset.ready="false";console.warn("VGPU post-processing unavailable; using the WebGL base render.",error);});
    let frame = 0;let lastVgpuTransfer=0;const demoStart=performance.now();
    const loop = (time=0) => {
      controls.update();
      const runtime=runtimeRef.current;
      if(!runtime)return;
      if(runtime.autoRotate&&latestPropsRef.current.demoSpin){model.rotation.y=Math.sin((time-demoStart)*.00045)*THREE.MathUtils.degToRad(18);emitRotation(time);}

      const current=latestPropsRef.current;
      const camPos = camera.getWorldPosition(new THREE.Vector3());
      runtime.model.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
          if (child.material.uniforms.time) child.material.uniforms.time.value = time / 1000;
          if (child.material.uniforms.worldCameraPosition) child.material.uniforms.worldCameraPosition.value.copy(camPos);
        }
      });

      if(current.material==="ASCII"){
        renderer.domElement.style.opacity="0";
        vgpuMaterialCanvas.style.visibility="hidden";
        vgpuTransmissionCanvas.style.visibility="hidden";
        vgpuPostCanvas.style.visibility="hidden";
        asciiCanvas.style.display="block";
        if(time-runtime.asciiLastFrame>42){
          const {width,height}=host.getBoundingClientRect();
          renderAscii(runtime,width,height,"scene",current.asciiGlyphs,runtime.asciiCanvas,current.asciiCharacters);
          runtime.asciiLastFrame=time;
        }
      }else{
        asciiCanvas.style.display="none";
        const transmissionActive=current.material==="VGPU Glass"||current.effect==="VGPU Refraction";
        let transmissionDrawn=false;
        if(transmissionActive&&vgpuTransmissionLayer){
          // The transmission pass must receive the real scene *behind* the
          // object. Hide only the model for this render, then refract that
          // framebuffer through the uploaded Playtools mesh in VGPU.
          const modelWasVisible=model.visible;
          model.visible=false;
          renderer.render(scene,camera);
          model.visible=modelWasVisible;
          transmissionDrawn=vgpuTransmissionLayer.draw(camera,model,{
            color:current.color,
            ior:current.glassIor,
            roughness:current.roughness/100,
            transparency:current.glassTransparency/100,
            reflection:current.glassReflection/100,
            frost:current.glassFrost/100,
            rayAngle:current.vgpuRayAngle,
            rayStrength:current.vgpuRayStrength/100,
            dispersion:0.35,
            background:scene.background,
          });
        }

        const sceneMaterial=current.material as VgpuSceneMaterial;
        const materialActive=!transmissionActive&&vgpuMaterials.has(sceneMaterial);
        const materialDrawn=Boolean(materialActive&&vgpuMaterialLayer?.draw(camera,model,{
          material:sceneMaterial,
          color:current.color,
          roughness:current.roughness/100,
          reflection:current.glassReflection/100,
          frost:current.glassFrost/100,
          light:current.light,
          ambientLight:current.ambientLight,
          lightPosition:[current.lightX,current.lightY,current.lightZ],
          background:scene.background,
        }));
        if(!transmissionActive&&!materialDrawn){
          const legacyEffect=(effectModes[current.effect]??0)>0;
          if(legacyEffect)renderWithEffects(runtime,current,true,time);else renderer.render(scene,camera);
        }else if(transmissionActive&&!transmissionDrawn){
          // Keep a usable WebGL fallback while the VGPU pipeline compiles.
          renderer.render(scene,camera);
        }
        renderer.domElement.style.opacity=(transmissionDrawn||materialDrawn)?"0":"1";
        vgpuMaterialCanvas.style.visibility=materialDrawn?"visible":"hidden";
        vgpuTransmissionCanvas.style.visibility=transmissionDrawn?"visible":"hidden";

        const effectMode=vgpuEffectModes[current.effect]??0;
        const postActive=!transmissionDrawn&&!materialDrawn&&effectMode>0;
        vgpuPostCanvas.style.visibility=postActive?"visible":"hidden";
        if(postActive&&vgpuPostLayer&&time-lastVgpuTransfer>=32){
          lastVgpuTransfer=time;
          vgpuPostLayer.draw({effectMode,intensity:current.effectIntensity/100,time:time/1000});
        }
      }
      frame=requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); worker.terminate(); controls.dispose();renderer.domElement.removeEventListener("pointerdown",pointerDown);renderer.domElement.removeEventListener("pointermove",pointerMove);renderer.domElement.removeEventListener("pointerup",pointerUp);renderer.domElement.removeEventListener("pointercancel",pointerUp);renderer.domElement.removeEventListener("wheel",stopAuto);vgpuDisposed=true;vgpuMaterialLayer?.dispose();vgpuTransmissionLayer?.dispose();vgpuPostLayer?.dispose();backgroundTarget.dispose();composer.dispose();renderer.dispose(); host.removeChild(renderer.domElement);host.removeChild(vgpuMaterialCanvas);host.removeChild(vgpuTransmissionCanvas);host.removeChild(vgpuPostCanvas);host.removeChild(asciiCanvas);runtimeRef.current = null; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const build = async () => {
      const runtime = runtimeRef.current; if (!runtime) return;
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
      const requestId=++runtime.requestId;const heavy=shapeGeometryMode!=="Extrude"||shapeSegments>=64||(deforming&&shapeSurfaceDetail>=3)||shapeMass>=70||shapeEdge>=180;onShapeLoading?.(heavy);
      // SVGLoader samples every curve separately, so a nominal value of 256
      // can otherwise create thousands of contour points per ring. Preserve
      // the requested visual detail while bounding the actual ring density.
      const ringLimit=Math.min(1024,Math.max(48,48+shapeSegments));
      const sampled=shapes.map(shape=>({outer:limitRing(shape.getPoints(Math.max(3,shapeSegments)),ringLimit).map(point=>[point.x,point.y]),holes:shape.holes.map(hole=>limitRing(hole.getPoints(Math.max(3,shapeSegments)),ringLimit).map(point=>[point.x,point.y]))}));
      runtime.worker.postMessage({id:requestId,shapes:sampled,geometryMode:shapeGeometryMode,thickness:shapeThickness,segments:shapeSegments,surfaceDetail:shapeSurfaceDetail,edge:shapeEdge,mass:shapeMass,revolveAngle:shapeRevolveAngle,revolveEdge:shapeRevolveEdge,inflateAmount:shapeInflateAmount,inflateDirection:shapeInflateDirection,bend:shapeBend,bulge:shapeBulge,taper:shapeTaper,twist:shapeTwist});
    };
    build(); return () => { cancelled = true; };
  }, [shapeSource,shapeFileName,shapeText,shapeFontUrl,shapeFontWeight,shapeLetterSpacing,shapeLineSpacing,shapeGeometryMode,shapeThickness,shapeSegments,shapeSurfaceDetail,shapeEdge,shapeMass,shapeRevolveAngle,shapeRevolveEdge,shapeInflateAmount,shapeInflateDirection,shapeBend,shapeBulge,shapeTaper,shapeTwist,onShapeLoading,onShapeError]);

  useEffect(() => {
    const runtime = runtimeRef.current; if (!runtime) return;
    runtime.model.traverse((child) => { if (child instanceof THREE.Mesh) { const old = child.material as THREE.Material; child.material = makeMaterial(props.material, props.color, props.roughness, props.textureRepeat, props.textureRotation,props.textureTint,props.normalStrength,props.colorOpacity,props.glassIor,props.glassTransparency,props.glassReflection,props.glassFrost,props.customMaterialUrl); old.dispose(); } });
  }, [props.material,props.customMaterialUrl,props.color,props.roughness,props.textureRepeat,props.textureRotation,props.textureTint,props.normalStrength,props.colorOpacity,props.glassIor,props.glassTransparency,props.glassReflection,props.glassFrost]);

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

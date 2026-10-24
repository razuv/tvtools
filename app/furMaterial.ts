import * as THREE from "three";
import {furGeometry} from "./furGeometry.ts";
import { applyColorGradient, type GradientSettings } from "./gradientMaterial.ts";

export function removeFurShells(mesh:THREE.Mesh) {
  for(const child of [...mesh.children])if(child instanceof THREE.InstancedMesh&&child.userData.furShell){
    mesh.remove(child);child.geometry.dispose();(child.material as THREE.Material).dispose();child.dispose();
  }
}

export function addFurShells(mesh:THREE.Mesh,color:string,opacity:number,length:number,density:number,appearance:GradientSettings,layers=24) {
  removeFurShells(mesh);
  if(length<=0)return;
  const geometry=furGeometry(mesh.geometry,layers);
  geometry.setAttribute("furLayer",new THREE.InstancedBufferAttribute(Float32Array.from({length:layers},(_,i)=>(i+1)/layers),1));
  const material=new THREE.MeshStandardMaterial({color,roughness:.95,metalness:0,side:THREE.FrontSide,opacity:THREE.MathUtils.clamp(opacity,0,1),transparent:opacity<1});
  applyColorGradient(material,geometry.boundingBox!,color,appearance);
  const compile=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
  material.customProgramCacheKey=()=>`${cacheKey}|fur-shells`;
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);
    shader.uniforms.furLength={value:THREE.MathUtils.clamp(length,0,100)/500};
    shader.uniforms.furDensity={value:THREE.MathUtils.clamp(density,30,220)};
    shader.vertexShader=`attribute float furLayer; varying float vFurLayer; varying vec3 vFurRest; varying vec3 vFurNormal; uniform float furLength;\n`+shader.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>
      vFurRest=position; vFurNormal=normal; vFurLayer=furLayer;
      transformed+=normal*furLength*furLayer;
      transformed.y-=furLength*.35*furLayer*furLayer;
    `);
    shader.fragmentShader=`varying float vFurLayer; varying vec3 vFurRest; varying vec3 vFurNormal; uniform float furDensity;
      float furHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n`+shader.fragmentShader.replace("#include <alphatest_fragment>",`#include <alphatest_fragment>
      vec3 furN=abs(normalize(vFurNormal));
      vec2 furUV=furN.x>furN.y&&furN.x>furN.z?vFurRest.yz:(furN.y>furN.z?vFurRest.xz:vFurRest.xy);
      vec2 furGrid=furUV*furDensity;
      vec2 furCell=floor(furGrid);
      float furRandom=furHash(furCell);
      vec2 furCenter=vec2(.2)+.6*vec2(furRandom,furHash(furCell+vec2(19.3,7.1)));
      float furRadius=.36*(1.0-.85*vFurLayer);
      if(length(fract(furGrid)-furCenter)>furRadius||vFurLayer>mix(.55,1.0,furRandom))discard;
      diffuseColor.rgb*=mix(.45,1.08,vFurLayer);
    `);
  };
  const shells=new THREE.InstancedMesh(geometry,material,layers),identity=new THREE.Matrix4();
  for(let i=0;i<layers;i++)shells.setMatrixAt(i,identity);
  shells.instanceMatrix.needsUpdate=true;shells.userData.furShell=true;shells.receiveShadow=true;shells.castShadow=false;
  shells.frustumCulled=false;mesh.add(shells);
  return shells;
}

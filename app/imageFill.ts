import * as THREE from "three";
import {useTriplanarMaps} from "./triplanar.ts";

type ImageEntry={texture:THREE.Texture;ready:Promise<void>;references:number};
const images=new Map<string,ImageEntry>();

export function waitForImageFill(source:string){return images.get(source)?.ready??Promise.resolve();}

export function applyImageFill(material:THREE.Material,source:string,repeat=2){
  if(!(material instanceof THREE.MeshStandardMaterial)||!source)return;
  let entry=images.get(source);
  if(!entry){
    let loaded!:()=>void,failed!:(error:unknown)=>void;
    const ready=new Promise<void>((resolve,reject)=>{loaded=resolve;failed=reject;});
    const texture=new THREE.TextureLoader().load(source,()=>loaded(),undefined,failed);
    ready.catch(()=>{});
    texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;
    entry={texture,ready,references:0};images.set(source,entry);
  }
  entry.references++;
  // Material-specific transforms must not change another object's copy of this image.
  const texture=entry.texture.clone();texture.source=entry.texture.source;
  entry.ready.then(()=>{texture.needsUpdate=true;}).catch(()=>{});
  texture.repeat.set(repeat,repeat);
  material.map=texture;material.color.set("#ffffff");material.transparent=true;material.alphaTest=.01;
  useTriplanarMaps(material);
  const shared=entry;
  const release=()=>{material.removeEventListener("dispose",release);texture.dispose();if(--shared.references===0){shared.texture.dispose();images.delete(source);}};
  material.addEventListener("dispose",release);
}

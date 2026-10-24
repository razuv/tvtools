import * as THREE from "three";
import {mergeVertices} from "three/addons/utils/BufferGeometryUtils.js";

const cache=new WeakMap<THREE.BufferGeometry,THREE.BufferGeometry>();

export function furGeometry(source:THREE.BufferGeometry,layers:number){
  if(layers<=8&&cache.has(source))return cache.get(source)!.clone();
  const geometry=source.clone();
  if(layers>8||geometry.getAttribute("position").count<20000)return geometry;
  geometry.computeBoundingBox();
  const size=geometry.boundingBox!.getSize(new THREE.Vector3());
  // Shells can use a coarser surface; the original model and exported mesh stay intact.
  for(const name of Object.keys(geometry.attributes))if(name!=="position")geometry.deleteAttribute(name);
  const reduced=mergeVertices(geometry,Math.max(size.x,size.y,size.z)/120);geometry.dispose();
  const index=reduced.getIndex()!,triangles:number[]=[];
  for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);if(a!==b&&b!==c&&c!==a)triangles.push(a,b,c);}
  reduced.setIndex(triangles);reduced.computeVertexNormals();
  cache.set(source,reduced);source.addEventListener("dispose",()=>{reduced.dispose();cache.delete(source);});
  return reduced.clone();
}

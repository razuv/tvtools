import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function parseModel(data:ArrayBuffer, fileName:string) {
  const parts:THREE.BufferGeometry[]=[];
  if (/\.stl$/i.test(fileName)) parts.push(new STLLoader().parse(data));
  else if (/\.obj$/i.test(fileName)) {
    const object=new OBJLoader().parse(new TextDecoder().decode(data));
    object.updateMatrixWorld(true);
    object.traverse(child=>{
      if(child instanceof THREE.Mesh) parts.push(child.geometry.clone().applyMatrix4(child.matrixWorld));
    });
    object.traverse(child=>{
      if(child instanceof THREE.Mesh){child.geometry.dispose();const materials=Array.isArray(child.material)?child.material:[child.material];materials.forEach(material=>material.dispose());}
    });
  } else throw new Error("OBJ and STL files only");
  const triangles=parts.map(part=>{
    const geometry=part.index?part.toNonIndexed():part.clone();
    part.dispose();
    for(const name of Object.keys(geometry.attributes)) if(!["position","normal","uv"].includes(name)) geometry.deleteAttribute(name);
    if(!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    if(!geometry.getAttribute("uv")) geometry.setAttribute("uv",new THREE.BufferAttribute(new Float32Array(geometry.getAttribute("position").count*2),2));
    return geometry;
  });
  const geometry=triangles.length?mergeGeometries(triangles):null;
  triangles.forEach(part=>part.dispose());
  if(!geometry) throw new Error("Model contains no triangle meshes");
  const positions=geometry.getAttribute("position");
  if(!positions.count||positions.count%3||!Array.from(positions.array).every(Number.isFinite)){geometry.dispose();throw new Error("Model contains invalid geometry");}
  geometry.computeBoundingBox();
  const size=geometry.boundingBox!.getSize(new THREE.Vector3());
  const extent=Math.max(size.x,size.y,size.z);
  if(!Number.isFinite(extent)||extent<=0){geometry.dispose();throw new Error("Model has no size");}
  geometry.center();geometry.scale(2.6/extent,2.6/extent,2.6/extent);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

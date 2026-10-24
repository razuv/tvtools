import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {FBXLoader} from "three/addons/loaders/FBXLoader.js";
import {USDZExporter} from "three/addons/exporters/USDZExporter.js";
import {exportFbx} from "../app/modelExport.ts";

test("FBX round-trips transformed geometry, normals and UVs",()=>{
  const model=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
  mesh.position.set(2,3,4);model.add(mesh);
  const shell=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());shell.userData.furShell=true;model.add(shell);
  const bytes=new TextEncoder().encode(exportFbx(model));
  const imported=new FBXLoader().parse(bytes.buffer,"");
  const meshes=[];imported.traverse(child=>{if(child.isMesh)meshes.push(child);});
  assert.equal(meshes.length,1);
  const geometry=meshes[0].geometry;geometry.computeBoundingBox();
  assert.equal(geometry.getAttribute("position").count,36);
  assert.equal(geometry.getAttribute("normal").count,36);
  assert.equal(geometry.getAttribute("uv").count,36);
  assert.deepEqual(geometry.boundingBox.getCenter(new THREE.Vector3()).toArray(),[2,3,4]);
  assert.throws(()=>exportFbx(new THREE.Group()),/No geometry/);
});

test("USDZ exporter creates an archive for the model",async()=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
  const bytes=await new USDZExporter().parseAsync(mesh);
  assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);assert.ok(bytes.length>1000);
});

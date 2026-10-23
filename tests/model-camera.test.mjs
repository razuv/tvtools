import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { parseModel } from "../app/modelImport.ts";
import { setCameraView, getCameraView } from "../app/cameraView.ts";
const bytes=text=>new TextEncoder().encode(text).buffer;

test("OBJ imports are centered and fitted to the stage",()=>{
  const geometry=parseModel(bytes("v 10 0 0\nv 20 0 0\nv 10 10 0\nf 1 2 3"),"triangle.obj");
  assert.equal(geometry.getAttribute("position").count,3);
  assert.ok(geometry.getAttribute("normal"));
  assert.ok(geometry.boundingBox.getCenter(new THREE.Vector3()).length()<1e-6);
  assert.ok(Math.abs(geometry.boundingBox.getSize(new THREE.Vector3()).x-2.6)<1e-6);
  geometry.dispose();
});
test("STL imports and invalid models",()=>{
  const geometry=parseModel(bytes("solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid test"),"triangle.stl");
  assert.equal(geometry.getAttribute("position").count,3);geometry.dispose();
  assert.throws(()=>parseModel(bytes(""),"empty.obj"),/no triangle/);
  assert.throws(()=>parseModel(bytes("v 0 0 0\nf 1 1 1"),"point.obj"),/no size/);
});
test("camera zoom keeps the viewing direction and focal length changes perspective",()=>{
  const camera=new THREE.PerspectiveCamera(36,1,.1,100),target=new THREE.Vector3(1,2,3);
  camera.position.copy(target).add(new THREE.Vector3(0,0,5.4));
  setCameraView(camera,target,"zoom",2);
  assert.ok(Math.abs(camera.position.distanceTo(target)-2.7)<1e-10);
  assert.equal(camera.position.x,1);assert.equal(camera.position.y,2);
  camera.lookAt(target);camera.updateMatrixWorld();
  const centerPlane=target.clone().add(new THREE.Vector3(.5,0,0));
  const nearer=target.clone().add(new THREE.Vector3(.5,0,1));
  const sizeBefore=centerPlane.clone().project(camera).x;
  const perspectiveBefore=nearer.clone().project(camera).x;
  setCameraView(camera,target,"focalLength",85);
  camera.updateMatrixWorld();
  assert.ok(Math.abs(centerPlane.clone().project(camera).x-sizeBefore)<1e-10);
  assert.ok(Math.abs(nearer.clone().project(camera).x-perspectiveBefore)>.01);
  assert.equal(getCameraView(camera,target).zoom,2);
  assert.ok(Math.abs(camera.getFocalLength()-85)<1e-10);
  setCameraView(camera,target,"zoom",0);assert.equal(getCameraView(camera,target).zoom,.23);
  const before=camera.position.clone();setCameraView(camera,target,"zoom",NaN);assert.deepEqual(camera.position,before);
  setCameraView(camera,target,"focalLength",500);assert.ok(Math.abs(camera.getFocalLength()-200)<1e-10);
});

test("bundled Cat Base Mesh loads with real depth",()=>{
  const data=readFileSync(new URL("../public/models/cat.obj",import.meta.url));
  const geometry=parseModel(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),"cat.obj");
  assert.ok(geometry.getAttribute("position").count>1000);
  assert.ok(geometry.boundingBox.getSize(new THREE.Vector3()).z>.5);
  geometry.dispose();
});

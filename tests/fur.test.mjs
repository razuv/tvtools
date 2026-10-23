import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { addFurShells,removeFurShells } from "../app/furMaterial.ts";
const appearance={colorMode:"Linear",gradientColor:"#ff6600",gradientAngle:45};
function fixture(){const geometry=new THREE.SphereGeometry(1,12,8);geometry.computeBoundingBox();return new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());}

test("fur creates instanced normal-offset shells without changing the base geometry",()=>{
  const mesh=fixture(),original=mesh.geometry.getAttribute("position").array.slice();
  const shells=addFurShells(mesh,"#aabbcc",1,40,120,appearance);
  assert.ok(shells.isInstancedMesh);assert.equal(shells.count,24);assert.equal(shells.geometry.getAttribute("furLayer").count,24);
  assert.notEqual(shells.geometry,mesh.geometry);assert.deepEqual(mesh.geometry.getAttribute("position").array,original);
  assert.equal(shells.castShadow,false);assert.equal(shells.userData.furShell,true);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  shells.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.furLength.value,.08);assert.equal(shader.uniforms.furDensity.value,120);
  assert.match(shader.vertexShader,/transformed\+=normal\*furLength/);assert.match(shader.fragmentShader,/discard/);
  assert.match(shader.fragmentShader,/gradientStart/);assert.match(shader.fragmentShader,/diffuseColor.rgb\*=mix/);
  removeFurShells(mesh);mesh.geometry.dispose();mesh.material.dispose();
});
test("changing fur disposes old resources and zero length restores a plain surface",()=>{
  const mesh=fixture(),shells=addFurShells(mesh,"#ffffff",.5,35,120,{...appearance,colorMode:"Solid"});let disposed=0;
  shells.geometry.addEventListener("dispose",()=>disposed++);shells.material.addEventListener("dispose",()=>disposed++);shells.addEventListener("dispose",()=>disposed++);
  addFurShells(mesh,"#ffffff",1,0,120,appearance);
  assert.equal(mesh.children.length,0);assert.equal(disposed,3);
  mesh.geometry.dispose();mesh.material.dispose();
});

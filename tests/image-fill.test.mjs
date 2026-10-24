import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {applyColorGradient} from "../app/gradientMaterial.ts";
import {addFurShells,removeFurShells} from "../app/furMaterial.ts";

const settings={colorMode:"Image",imageFill:"/textures/leopard.svg",textureRepeat:3,gradientColor:"#000000",gradientAngle:0};
const bounds=new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1));
function compile(material){const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);return shader;}

test("image fill projects without UVs, preserves lighting hooks and releases its texture",context=>{
  context.mock.method(THREE.TextureLoader.prototype,"load",()=>new THREE.Texture());
  const material=new THREE.MeshStandardMaterial({color:"red"});let previous=0;
  material.onBeforeCompile=()=>previous++;
  applyColorGradient(material,bounds,"red",settings);
  assert.equal(material.map.colorSpace,THREE.SRGBColorSpace);assert.equal(material.map.wrapS,THREE.RepeatWrapping);
  assert.equal(material.map.repeat.x,3);assert.equal(material.color.getHexString(),"ffffff");
  const shader=compile(material);assert.equal(previous,1);assert.ok(shader.uniforms.uTriplanarTransform);
  assert.match(shader.fragmentShader,/texture2D\(map,uvZ\)/);
  let disposed=0;material.map.addEventListener("dispose",()=>disposed++);material.dispose();assert.equal(disposed,1);
});

test("image fill is shared by fur shells without replacing their lighting or hair mask",context=>{
  context.mock.method(THREE.TextureLoader.prototype,"load",()=>new THREE.Texture());
  const geometry=new THREE.SphereGeometry(1,12,8);geometry.computeBoundingBox();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());
  const shells=addFurShells(mesh,"red",1,35,120,settings);
  const shader=compile(shells.material);assert.ok(shells.material.map);assert.ok(shader.uniforms.furLength);
  assert.match(shader.fragmentShader,/texture2D\(map,uvZ\)/);assert.match(shader.fragmentShader,/furRadius/);
  removeFurShells(mesh);geometry.dispose();mesh.material.dispose();
});

test("export hair reuses the decoded image and waits for it before rendering",async context=>{
  const {waitForImageFill}=await import("../app/imageFill.ts");
  let finish,loads=0;
  context.mock.method(THREE.TextureLoader.prototype,"load",(_source,onLoad)=>{
    loads++;const texture=new THREE.Texture();finish=()=>{texture.image={width:8,height:8};onLoad(texture);};return texture;
  });
  const geometry=new THREE.SphereGeometry(1,12,8);geometry.computeBoundingBox();
  const material=new THREE.MeshStandardMaterial();applyColorGradient(material,geometry.boundingBox,"white",settings);
  const mesh=new THREE.Mesh(geometry,material);addFurShells(mesh,"white",1,35,120,settings,6);
  let ready=false;const waiting=waitForImageFill(settings.imageFill).then(()=>{ready=true;});
  await Promise.resolve();assert.equal(ready,false);finish();await waiting;
  const shells=addFurShells(mesh,"white",1,35,120,settings,24);
  await waitForImageFill(settings.imageFill);
  assert.equal(loads,1);assert.equal(shells.count,24);assert.equal(shells.material.map.image,material.map.image);
  assert.equal(shells.material.map.image.width,8);
  removeFurShells(mesh);material.dispose();geometry.dispose();
});

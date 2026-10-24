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

test("FBX preserves material assignments, sRGB colors, opacity and surface properties",()=>{
  const red=new THREE.MeshPhysicalMaterial({color:"#FF5C35",roughness:.25,metalness:.8,opacity:.6,transparent:true,ior:1.7,transmission:.3,emissive:"#102030",emissiveIntensity:.4});
  const blue=new THREE.MeshStandardMaterial({color:"#2878FF",roughness:.9,metalness:0});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),[red,blue]);
  mesh.geometry.groups.forEach((group,index)=>{group.materialIndex=index%2;});
  const text=exportFbx(mesh),imported=new FBXLoader().parse(new TextEncoder().encode(text).buffer,"");
  let result;imported.traverse(child=>{if(child.isMesh)result=child;});
  assert.equal(result.material.length,2);
  const [first,second]=result.material;
  assert.equal(first.color.getHexString(),"ff5c35");assert.equal(second.color.getHexString(),"2878ff");
  assert.equal(first.opacity,.6);assert.equal(first.transparent,true);
  assert.equal(first.reflectivity,.8);assert.equal(first.shininess,30);
  assert.equal(first.emissive.getHexString(),"102030");assert.equal(first.emissiveIntensity,.4);
  assert.ok(second.shininess<first.shininess);
  assert.deepEqual(result.geometry.groups.map(group=>group.materialIndex),[0,1,0,1,0,1]);
  assert.match(text,/P: "Roughness", "Number", "", "AU",0.25/);
  assert.match(text,/P: "IOR", "Number", "", "AU",1.7/);
  assert.match(text,/P: "Transmission", "Number", "", "AU",0.3/);
});

test("FBX stores gradient stops as vertex colors without tinting them twice",()=>{
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute([-1,0,0,0,1,0,1,0,0],3));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:"#FF0000"}));
  const appearance={color:"#FF0000",colorMode:"Linear",gradientColor:"#0000FF",gradientAngle:0,gradientStops:[{position:0,color:"#FF0000"},{position:.5,color:"#00FF00"},{position:1,color:"#0000FF"}]};
  const text=exportFbx(mesh,appearance),imported=new FBXLoader().parse(new TextEncoder().encode(text).buffer,"");
  let result;imported.traverse(child=>{if(child.isMesh)result=child;});
  const colors=result.geometry.getAttribute("color");
  assert.equal(result.material.vertexColors,true);assert.equal(result.material.color.getHexString(),"ffffff");
  assert.equal(new THREE.Color().fromBufferAttribute(colors,0).getHexString(),"ff0000");
  assert.equal(new THREE.Color().fromBufferAttribute(colors,1).getHexString(),"00ff00");
  assert.equal(new THREE.Color().fromBufferAttribute(colors,2).getHexString(),"0000ff");
});

test("FBX embeds diffuse and normal images and transfers texture transforms to UVs",()=>{
  const map=new THREE.Texture(),normalMap=new THREE.Texture();
  map.repeat.set(2,3);map.offset.set(.1,.2);map.wrapS=map.wrapT=THREE.RepeatWrapping;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshStandardMaterial({map,normalMap}));
  const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYHkAAAAASUVORK5CYII=";
  const text=exportFbx(mesh,undefined,new Map([[map,png],[normalMap,png]]));
  const loaded=[];
  const manager=new THREE.LoadingManager(),loader=new THREE.TextureLoader(manager);
  loader.load=url=>{loaded.push(url);return new THREE.Texture();};manager.addHandler(/\.png$/i,loader);
  const imported=new FBXLoader(manager).parse(new TextEncoder().encode(text).buffer,"");
  let result;imported.traverse(child=>{if(child.isMesh)result=child;});
  assert.equal(loaded.length,2);assert.ok(loaded.every(url=>url===`data:image/png;base64,${png}`));
  assert.ok(result.material.map);assert.ok(result.material.normalMap);
  assert.equal(result.material.map.wrapS,THREE.RepeatWrapping);
  const uv=result.geometry.getAttribute("uv");assert.ok(Math.abs(uv.getX(0)-.1)<1e-6);assert.ok(Math.abs(uv.getY(0)-3.2)<1e-6);
  assert.throws(()=>exportFbx(mesh),/Texture image is missing/);
});

test("FBX projects texture coordinates on models without usable UVs",()=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute([0,0,0,0,3,0,0,0,3],3));geometry.computeVertexNormals();
  const map=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map});material.userData.triplanarApplied=true;
  const text=exportFbx(new THREE.Mesh(geometry,material),undefined,new Map([[map,"test"]]));
  assert.match(text,/UV: \*6 \{\s*a: 0.5,0.5,0.5,1.5,1.5,0.5/);
});

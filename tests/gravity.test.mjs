import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ModelPhysics } from "../app/gravity.ts";

function fixture(){const geometry=new THREE.BoxGeometry(1,1,1),model=new THREE.Group();model.position.y=2;return {geometry,model,physics:new ModelPhysics(geometry,model,-1)};}
test("rigid bodies land, bounce and sleep without falling through the floor",()=>{
  const {geometry,model,physics}=fixture();let bounced=false;
  for(let i=0;i<900;i++){physics.step(1/120);if(physics.body.velocity.y>.1)bounced=true;assert.ok(model.position.y>-.55);}
  assert.ok(bounced);assert.ok(Math.abs(model.position.y+.5)<.03);assert.equal(physics.body.sleepState,2);geometry.dispose();
});
test("off-center dragging produces rotation and release preserves angular inertia",()=>{
  const {geometry,model,physics}=fixture();physics.grab(new THREE.Vector3(.45,2,0));physics.dragTo(new THREE.Vector3(.45,3,1));
  for(let i=0;i<45;i++)physics.step(1/120);
  assert.ok(physics.body.angularVelocity.length()>.1);assert.ok(model.quaternion.angleTo(new THREE.Quaternion())>.1);
  physics.release();assert.equal(physics.dragging,false);
  const before=model.quaternion.clone();physics.step(1/60);assert.ok(model.quaternion.angleTo(before)>.001);geometry.dispose();
});
test("paused frames are bounded and nonpositive steps preserve the pose",()=>{
  const {geometry,model,physics}=fixture();physics.step(1000);assert.ok(model.position.y>1.9);
  const position=model.position.clone(),rotation=model.quaternion.clone();
  physics.step(0);physics.step(-1);
  assert.deepEqual(model.position,position);assert.ok(model.quaternion.equals(rotation));geometry.dispose();
});
test("tilted bodies settle with contacts based on their shape",()=>{
  const geometry=new THREE.BoxGeometry(1,2,.4),model=new THREE.Group();model.position.y=2;model.rotation.z=.65;
  const physics=new ModelPhysics(geometry,model,-1);physics.body.velocity.x=2;
  for(let i=0;i<1200;i++)physics.step(1/120);
  model.add(new THREE.Mesh(geometry));
  const box=new THREE.Box3().setFromObject(model);
  assert.ok(Number.isFinite(model.position.y));assert.ok(physics.body.velocity.length()<.1);
  assert.ok(physics.body.angularVelocity.length()<.1);assert.ok(Math.abs(box.min.y+1)<.03);geometry.dispose();
});

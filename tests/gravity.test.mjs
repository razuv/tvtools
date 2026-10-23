import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { stepGravity } from "../app/gravity.ts";

test("gravity lands on the floor and settles without sinking",()=>{
  const position=new Vector3(0,3,0),velocity=new Vector3();
  for(let i=0;i<600;i++){stepGravity(position,velocity,null,-1,1/60);assert.ok(position.y>=-1);}
  assert.equal(position.y,-1);assert.equal(velocity.y,0);
});
test("dragging follows with lag and release retains momentum",()=>{
  const position=new Vector3(),velocity=new Vector3(),target=new Vector3(2,2,0);
  stepGravity(position,velocity,target,-1,1/60);
  assert.ok(position.x>0&&position.x<target.x);
  for(let i=0;i<15;i++)stepGravity(position,velocity,target,-1,1/60);
  const before=position.clone();stepGravity(position,velocity,null,-1,1/60);
  assert.ok(position.x>before.x);
  assert.ok(velocity.y!==0);
});
test("frame pauses are bounded and floor contact accounts for mesh height",()=>{
  const position=new Vector3(0,4,0),velocity=new Vector3();
  stepGravity(position,velocity,null,.6,1000);
  assert.ok(position.y>3);
  for(let i=0;i<600;i++)stepGravity(position,velocity,null,.6,1/60);
  assert.equal(position.y,.6);
});

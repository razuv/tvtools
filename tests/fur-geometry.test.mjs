import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {furGeometry} from "../app/furGeometry.ts";

test("mobile hair shells reduce dense surfaces without changing the source or export detail",()=>{
  const source=new THREE.PlaneGeometry(2,2,200,200);source.computeBoundingBox();
  const original=source.getAttribute("position").array.slice(),count=source.index.count;
  const mobile=furGeometry(source,6),full=furGeometry(source,24),cached=furGeometry(source,6);
  assert.equal(cached.index.count,mobile.index.count);assert.notEqual(cached.getAttribute("position").array,mobile.getAttribute("position").array);
  assert.ok(mobile.index.count<count*.5);assert.ok(mobile.index.count>0);
  assert.equal(full.index.count,count);assert.deepEqual(source.getAttribute("position").array,original);
  assert.ok([...mobile.getAttribute("normal").array].every(Number.isFinite));
  const indices=mobile.index.array;for(let i=0;i<indices.length;i+=3)assert.ok(indices[i]!==indices[i+1]&&indices[i+1]!==indices[i+2]&&indices[i]!==indices[i+2]);
  source.dispose();mobile.dispose();full.dispose();cached.dispose();
});

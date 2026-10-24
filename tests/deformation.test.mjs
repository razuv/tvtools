import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {deformModel} from "../app/deformation.ts";
const zero={bend:0,bulge:0,taper:0,twist:0};

test("model deformation preserves the neutral mesh and changes each control independently",()=>{
  const source=new THREE.BoxGeometry(2,2,1,4,4,4).toNonIndexed();
  assert.equal(deformModel(source,zero),source);
  const original=Array.from(source.getAttribute("position").array);
  for(const key of Object.keys(zero)){
    const result=deformModel(source.clone(),{...zero,[key]:60});
    assert.notDeepEqual(Array.from(result.getAttribute("position").array),original);
    assert.equal(result.getAttribute("position").count,source.getAttribute("position").count);
    assert.ok(Array.from(result.getAttribute("position").array).every(Number.isFinite));
    assert.ok(Array.from(result.getAttribute("normal").array).every(Number.isFinite));
    assert.deepEqual(Array.from(result.getAttribute("uv").array),Array.from(source.getAttribute("uv").array));
    result.dispose();
  }
  assert.deepEqual(Array.from(source.getAttribute("position").array),original);
  source.dispose();
});

import test from "node:test";
import assert from "node:assert/strict";
import {renderQuality} from "../app/renderQuality.ts";

test("preview quality bounds fill rate and reduces work on constrained devices",()=>{
  const desktop=renderQuality({pixelRatio:3,cores:12,memory:16});
  assert.equal(desktop.pixelRatio,1.5);assert.equal(desktop.furLayers,20);assert.equal(desktop.shadowSize,1024);
  for(const hints of [{mobile:true},{cores:4},{memory:4}]){
    const low=renderQuality({pixelRatio:3,cores:12,memory:16,...hints});
    assert.equal(low.pixelRatio,1);assert.equal(low.furLayers,10);assert.equal(low.shadowSize,512);assert.equal(low.frameInterval,1000/30);
  }
  assert.equal(renderQuality({pixelRatio:1}).pixelRatio,1);
});

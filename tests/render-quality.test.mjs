import test from "node:test";
import assert from "node:assert/strict";
import {renderQuality} from "../app/renderQuality.ts";

test("preview quality bounds fill rate and reduces work on constrained devices",()=>{
  const desktop=renderQuality({pixelRatio:3,cores:12,memory:16});
  assert.equal(desktop.pixelRatio,2);assert.equal(desktop.furLayers,32);assert.equal(desktop.shadowSize,2048);
  for(const hints of [{mobile:true},{cores:4},{memory:4}]){
    const low=renderQuality({pixelRatio:3,cores:12,memory:16,...hints});
    assert.equal(low.pixelRatio,1);assert.equal(low.furLayers,6);assert.equal(low.shadowSize,512);assert.equal(low.frameInterval,1000/60);
  }
  assert.equal(renderQuality({pixelRatio:1}).pixelRatio,1);
});

test("device frame limits distinguish 30, 60 and unrestricted rendering",async()=>{
  const {frameInterval,parseFrameLimit}=await import("../app/renderQuality.ts");
  assert.equal(frameInterval(30),1000/30);assert.equal(frameInterval(60),1000/60);assert.equal(frameInterval(0),0);
  assert.equal(parseFrameLimit("0"),0);assert.equal(parseFrameLimit("30"),30);assert.equal(parseFrameLimit("60"),60);
  assert.equal(parseFrameLimit(null),60);assert.equal(parseFrameLimit("Infinity"),60);assert.equal(parseFrameLimit("-1"),60);
});

test("manual quality overrides device hints and increases detail at every level",async()=>{
  const {parseQualityLevel}=await import("../app/renderQuality.ts");
  let previous={pixelRatio:0,furLayers:0,shadowSize:0};
  for(const level of ["low","medium","high","ultra"]){
    const quality=renderQuality({level,pixelRatio:4,mobile:true,cores:2,memory:2});
    assert.ok(quality.pixelRatio>previous.pixelRatio);
    assert.ok(quality.furLayers>previous.furLayers);
    assert.ok(quality.shadowSize>previous.shadowSize);
    assert.equal(parseQualityLevel(level),level);
    previous=quality;
  }
  assert.equal(parseQualityLevel(null),"auto");assert.equal(parseQualityLevel("invalid"),"auto");
});

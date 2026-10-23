import test from "node:test";
import assert from "node:assert/strict";
import { captionInk,captionOpacity } from "../app/contrast.ts";

test("APCA chooses caption polarity after compositing at 50% opacity",()=>{
  assert.equal(captionOpacity,.5);
  assert.equal(captionInk([[255,255,255]]),"black");
  assert.equal(captionInk([[0,0,0]]),"white");
  assert.equal(captionInk([[40,120,255]]),"white");
  assert.equal(captionInk([[183,243,74]]),"black");
  assert.equal(captionInk([[18,54,12]]),"white");
});
test("gradient regions use the weakest contrast across their samples",()=>{
  assert.equal(captionInk([[230,240,250],[185,220,230],[255,255,255]]),"black");
  assert.equal(captionInk([[20,40,30],[92,59,153],[70,60,100]]),"white");
});

test("opaque logo chooses APCA polarity without inheriting caption transparency",()=>{
  assert.equal(captionInk([[255,255,255]],1),"black");
  assert.equal(captionInk([[0,0,0]],1),"white");
  assert.equal(captionInk([[40,120,255]],1),"white");
});

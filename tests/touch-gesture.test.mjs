import test from "node:test";
import assert from "node:assert/strict";
import {TouchGesture} from "../app/touchGesture.ts";

test("two-finger camera gestures cancel model dragging until all fingers are lifted",()=>{
  const touch=new TouchGesture();assert.equal(touch.start(1),true);assert.equal(touch.canDrag(1),true);
  assert.equal(touch.start(2),false);assert.equal(touch.canDrag(1),false);assert.equal(touch.canDrag(2),false);
  touch.end(2);assert.equal(touch.canDrag(1),false);
  touch.end(1);assert.equal(touch.start(3),true);touch.end(3);assert.equal(touch.canDrag(3),false);
});

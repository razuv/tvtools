import test from "node:test";
import assert from "node:assert/strict";
import { nextPresetName } from "../app/presetNames.ts";
test("new presets have sequential names without colliding with saved ones",()=>{
  assert.equal(nextPresetName([]),"Preset 1");
  assert.equal(nextPresetName(["Preset 1","Custom","Preset 3"]),"Preset 4");
  assert.equal(nextPresetName(["Custom","Preset draft"]),"Preset 1");
});

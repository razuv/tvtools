import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { migrateAppearance, createShaderMaterial, shaderPresets } from "../app/shaderMaterials.ts";

test("old ASCII saves become an effect without losing character settings",()=>{
  const old={material:"ASCII",effect:"Glow",asciiCharacters:90,asciiCustomSet:"01"};
  assert.deepEqual(migrateAppearance(old),{...old,material:"Gloss",effect:"ASCII"});
  assert.equal(old.material,"ASCII");
  assert.deepEqual(migrateAppearance({material:"Contour",effect:"ASCII"}),{material:"Gloss",effect:"ASCII"});
  assert.deepEqual(migrateAppearance({material:"Voronoi",effect:"Glow"}),{material:"Gloss",effect:"None"});
  assert.ok(!shaderPresets.includes("Voronoi"));
  for(const effect of ["Emboss","Night Vision","Glow"])assert.equal(migrateAppearance({material:"Glass",effect}).effect,"None");
  const modern={material:"Plasma",effect:"ASCII"};
  assert.equal(migrateAppearance(modern),modern);
});

test("shader presets retain PBR lighting and expose a shared animation clock",()=>{
  for(const preset of shaderPresets){
    const material=createShaderMaterial(preset,new THREE.Color("#aabbcc"),.3);
    assert.ok(material.isMeshPhysicalMaterial);
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
    material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.uPatternTime,material.userData.patternTime);
    assert.match(shader.vertexShader,/vPatternPosition = position/);
    assert.match(shader.fragmentShader,/#include <lights_fragment_begin>/);
    assert.match(shader.fragmentShader,/diffuseColor.rgb \*=/);
    assert.equal(material.customProgramCacheKey(),preset);
    material.dispose();
  }
});

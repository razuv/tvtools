import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { applyColorGradient } from '../app/gradientMaterial.ts';
import { useTriplanarMaps } from '../app/triplanar.ts';
import { createShaderMaterial } from '../app/shaderMaterials.ts';

const bounds=new THREE.Box3(new THREE.Vector3(-2,-1,0),new THREE.Vector3(2,1,0));
const settings={colorMode:'Solid',gradientColor:'#0000ff',gradientAngle:90};
function compile(material){const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};material.onBeforeCompile(shader);return shader;}

test('Solid preserves the original material and shader hooks',()=>{
  const material=new THREE.MeshPhysicalMaterial();const callback=material.onBeforeCompile;
  applyColorGradient(material,bounds,'#ff0000',settings);
  assert.equal(material.onBeforeCompile,callback);
});

test('all gradients normalize to the object bounds including flat geometry',()=>{
  for(const [mode,value] of [['Linear',1],['Radial',2],['Angular',3]]){
    const material=new THREE.MeshPhysicalMaterial();
    applyColorGradient(material,bounds,'#ff0000',{...settings,colorMode:mode});
    const shader=compile(material);
    assert.equal(shader.uniforms.gradientMode.value,value);
    assert.equal(shader.uniforms.gradientAngle.value,Math.PI/2);
    assert.ok(shader.uniforms.gradientStart.value.equals(new THREE.Color('#ff0000')));
    assert.ok(shader.uniforms.gradientEnd.value.equals(new THREE.Color('#0000ff')));
    assert.ok(shader.uniforms.gradientSize.value.z>0);
    assert.match(shader.fragmentShader,/mix\(gradientStart,gradientEnd/);
  }
});

test('gradients retain procedural and triplanar material behavior',()=>{
  const procedural=createShaderMaterial('Plasma',new THREE.Color('white'),.3);
  applyColorGradient(procedural,bounds,'#ff0000',{...settings,colorMode:'Linear'});
  const first=compile(procedural);assert.ok(first.uniforms.uPatternTime);assert.match(first.fragmentShader,/patternEmission/);
  const mapped=new THREE.MeshStandardMaterial({map:new THREE.Texture()});
  useTriplanarMaps(mapped);applyColorGradient(mapped,bounds,'#ff0000',{...settings,colorMode:'Radial'});
  const second=compile(mapped);assert.ok(second.uniforms.uTriplanarTransform);assert.ok(second.uniforms.gradientMode);
  assert.match(second.fragmentShader,/texture2D\(map,uvX\)/);
});

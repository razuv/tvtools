import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { addEffectPipeline } from "../app/backgroundComposite.ts";

test("isolated effects clear stale opaque alpha and composite background after color correction",()=>{
  const passes=[],scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  const effect=new ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:"void main(){}",fragmentShader:"void main(){}"});
  const composite=addEffectPipeline({addPass:pass=>passes.push(pass)},scene,camera,effect);
  assert.equal(passes[1],effect);assert.ok(passes[2] instanceof OutputPass);assert.equal(passes[3],composite);assert.equal(composite.enabled,false);
  let alpha=1;const clearAlphas=[];
  const renderer={autoClear:true,autoClearColor:true,autoClearDepth:true,autoClearStencil:true,getClearAlpha:()=>alpha,setClearAlpha:value=>{alpha=value;},setRenderTarget:()=>{},clear:()=>clearAlphas.push(alpha),render:()=>{}};
  passes[0].render(renderer,{},{});
  assert.deepEqual(clearAlphas,[0]);assert.equal(alpha,1);assert.equal(renderer.autoClear,true);
  passes.forEach(pass=>pass.dispose());
});

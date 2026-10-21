import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { init, effect, target, texture, sampler, frame } from "vgpu/mock";
import { prepareShader } from "@vgpu/wgsl/prepare";

test("VGPU Thermal binds input textures and preserves intensity across a resize",async()=>{
  const gpu=await init();const errors=[];gpu.onError(error=>errors.push(error));
  try {
    const shader=prepareShader(await readFile(new URL('../app/vgpu-effects.wgsl',import.meta.url),'utf8'));
    const output=target(gpu,{size:[4,4],format:'rgba8unorm'});
    const input=(size)=>texture(gpu,{kind:'2d',size:[size,size],format:'rgba8unorm-srgb',usage:['texture_binding','copy_dst','render_attachment']});
    let image=input(4);
    const pass=effect(gpu,shader,{set:{inputImage:image,imageSampler:sampler(gpu),settings:[9,1,0,0]}});
    await pass.compile(output);
    for(const intensity of [0,.7,1]){pass.set({settings:[9,intensity,0,0]});frame(gpu,f=>f.pass(output,pass));}
    image.dispose();image=input(8);output.resize([8,8]);pass.set({inputImage:image});frame(gpu,f=>f.pass(output,pass));
    await gpu.settled();assert.deepEqual(errors,[]);
  }finally{gpu.dispose();}
});

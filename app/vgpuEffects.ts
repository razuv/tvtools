import { effect, frame, init, sampler, surface, texture } from "vgpu";
import shader from "./vgpu-effects.wgsl";

export async function createVgpuEffects(){
  if(!navigator.gpu)return null;
  const gpu=await init({label:"Playtools effects"});
  try {
    const canvas=document.createElement("canvas");
    const output=surface(gpu,canvas,{size:[1,1],autoResize:false,dpr:1,format:"rgba8unorm",alphaMode:"premultiplied"});
    const makeInput=(width:number,height:number)=>texture(gpu,{kind:"2d",size:[width,height],format:"rgba8unorm-srgb",usage:["texture_binding","copy_dst","render_attachment"]});
    let input=makeInput(1,1),failed=false;
    const pass=effect(gpu,shader,{set:{inputImage:input,imageSampler:sampler(gpu,{magFilter:"linear",minFilter:"linear"}),settings:[9,1,0,0]}});
    await pass.compile(output);
    gpu.onError(()=>{failed=true;});
    void gpu.lost.then(()=>{failed=true;});
    return {
      canvas,
      render(source:HTMLCanvasElement,mode:number,intensity:number){
        if(failed)return false;
        try {
          if(input.size[0]!==source.width||input.size[1]!==source.height){input.dispose();input=makeInput(source.width,source.height);output.resize([source.width,source.height]);pass.set({inputImage:input});}
          gpu.gpu.queue.copyExternalImageToTexture({source},{texture:input.gpu},[source.width,source.height]);
          pass.set({settings:[mode,intensity,0,0]});
          frame(gpu,f=>f.pass(output,pass));
          return true;
        }catch{failed=true;return false;}
      },
      dispose(){gpu.dispose();},
    };
  }catch(error){gpu.dispose();throw error;}
}
export type VgpuEffects=NonNullable<Awaited<ReturnType<typeof createVgpuEffects>>>;

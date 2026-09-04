import { effect, frame, init, surface } from "vgpu";
import postShader from "./vgpu-post.wgsl";

export type VgpuPostOptions={materialMode:number;effectMode:number;intensity:number;ior:number;transparency:number;rayAngle:number;rayStrength:number;time:number};

export async function createVgpuPostLayer(source:HTMLCanvasElement,output:HTMLCanvasElement){
  const gpu=await init();
  const unsubscribeError=gpu.onError(error=>console.warn("VGPU render warning",error));
  let width=Math.max(1,source.width),height=Math.max(1,source.height);
  const sourceTexture=gpu.device.createTexture({label:"playtools.webgl-frame",size:[width,height],format:"rgba8unorm",usage:["copy_dst","texture_binding"]});
  const depthTexture=gpu.device.createTexture({label:"playtools.webgl-depth",size:[width,height],format:"depth24plus",usage:["copy_dst","texture_binding"]});
  output.width=width;output.height=height;
  const outputSurface=surface(gpu,output,{dpr:1});
  const post=effect(gpu,postShader,{label:"playtools.vgpu-post",set:{scene:sourceTexture,depth:depthTexture,params:{resolution:[1,1],time:0,materialMode:0,effectMode:0,intensity:1,ior:1.5,transparency:.88,rayAngle:35,rayStrength:.7}}});
  let disposed=false,busy=false,lastDraw=0,pending:Promise<void>=Promise.resolve();
  const resize=()=>{
    const nextWidth=Math.max(1,source.width),nextHeight=Math.max(1,source.height);
    if(nextWidth===width&&nextHeight===height)return;
    width=nextWidth;height=nextHeight;sourceTexture.resize([width,height]);depthTexture.resize([width,height]);post.set({scene:sourceTexture,depth:depthTexture});output.width=width;output.height=height;
  };
  return {
    draw(options:VgpuPostOptions, depthSource?: HTMLCanvasElement){
      const now=performance.now();
      if(disposed||busy||now-lastDraw<30)return;resize();
      busy=true;lastDraw=now;
      const copyColor=createImageBitmap(source).then(bitmap=>{
        if(disposed){bitmap.close();return;}
        gpu.device.gpu.queue.copyExternalImageToTexture({source:bitmap},{texture:sourceTexture.gpu},{width,height});
        bitmap.close();
      });
      const copyDepth=depthSource ? createImageBitmap(depthSource).then(bitmap=>{
        if(disposed){bitmap.close();return;}
        gpu.device.gpu.queue.copyExternalImageToTexture({source:bitmap},{texture:depthTexture.gpu},{width,height});
        bitmap.close();
      }) : Promise.resolve();
      pending=Promise.all([copyColor, copyDepth]).then(()=>{
        post.set({params:{resolution:[width,height],...options}});
        frame(gpu,current=>current.pass({target:outputSurface,clear:[0,0,0,0]},pass=>pass.draw(post)));
        return gpu.device.gpu.queue.onSubmittedWorkDone();
      }).then(()=>undefined).catch(error=>console.warn("VGPU frame transfer failed",error)).finally(()=>{busy=false;});
    },
    async settled(){await pending;await gpu.device.gpu.queue.onSubmittedWorkDone();},
    dispose(){if(disposed)return;disposed=true;unsubscribeError();sourceTexture.dispose();depthTexture.dispose();gpu.dispose();},
  };
}

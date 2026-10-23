import type { Camera,Scene } from "three";
import type { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

// Composite after OutputPass so the untouched background bypasses the effect and tone mapping.
export const backgroundCompositeShader={
  uniforms:{tDiffuse:{value:null},tBackground:{value:null}},
  vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D tDiffuse; uniform sampler2D tBackground; varying vec2 vUv;
    void main(){
      vec4 foreground=texture2D(tDiffuse,vUv);
      vec4 background=sRGBTransferOETF(texture2D(tBackground,vUv));
      gl_FragColor=vec4(mix(background.rgb,foreground.rgb,foreground.a),foreground.a+background.a*(1.0-foreground.a));
    }`,
};

export function addEffectPipeline(composer:Pick<EffectComposer,"addPass">,scene:Scene,camera:Camera,effectPass:ShaderPass) {
  const scenePass=new RenderPass(scene,camera);
  // Clear before rendering, rather than inheriting the previous opaque frame's alpha.
  scenePass.clearAlpha=0;composer.addPass(scenePass);composer.addPass(effectPass);
  composer.addPass(new OutputPass());
  const compositePass=new ShaderPass(backgroundCompositeShader);compositePass.enabled=false;composer.addPass(compositePass);
  return compositePass;
}

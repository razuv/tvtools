import * as THREE from "three";
import {applyImageFill} from "./imageFill.ts";

export type ColorMode="Solid"|"Linear"|"Radial"|"Angular"|"Image";
export type GradientSettings={colorMode:ColorMode;gradientColor:string;gradientAngle:number;imageFill?:string;textureRepeat?:number};

export function applyColorGradient(material:THREE.Material,bounds:THREE.Box3,color:string,settings:GradientSettings){
  if(settings.colorMode==="Image"){applyImageFill(material,settings.imageFill??"",settings.textureRepeat);return;}
  if(settings.colorMode==="Solid")return;
  const compile=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
  const minimum=bounds.min.clone(),size=bounds.getSize(new THREE.Vector3()).max(new THREE.Vector3(.0001,.0001,.0001));
  material.customProgramCacheKey=()=>`${cacheKey}|appearance-gradient`;
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);
    Object.assign(shader.uniforms,{
      gradientStart:{value:new THREE.Color(color)},gradientEnd:{value:new THREE.Color(settings.gradientColor)},
      gradientMode:{value:{Linear:1,Radial:2,Angular:3}[settings.colorMode as Exclude<ColorMode,"Solid"|"Image">]},
      gradientAngle:{value:THREE.MathUtils.degToRad(settings.gradientAngle)},
      gradientMin:{value:minimum},gradientSize:{value:size},
    });
    shader.vertexShader="varying vec2 vGradientPosition; uniform vec3 gradientMin; uniform vec3 gradientSize;\n"+shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvGradientPosition=(position.xy-gradientMin.xy)/gradientSize.xy-0.5;");
    shader.fragmentShader="varying vec2 vGradientPosition; uniform vec3 gradientStart; uniform vec3 gradientEnd; uniform float gradientMode; uniform float gradientAngle;\n"+shader.fragmentShader.replace("vec4 diffuseColor = vec4( diffuse, opacity );",`
      vec4 diffuseColor = vec4( diffuse, opacity );
      vec2 direction=vec2(cos(gradientAngle),sin(gradientAngle));
      float gradientT=0.5+dot(vGradientPosition,direction)/max(abs(direction.x)+abs(direction.y),0.0001);
      if(gradientMode>1.5&&gradientMode<2.5)gradientT=length(vGradientPosition)*2.0;
      if(gradientMode>2.5){gradientT=0.0;if(dot(vGradientPosition,vGradientPosition)>0.00000001)gradientT=fract(atan(vGradientPosition.x,vGradientPosition.y)/6.2831853-gradientAngle/6.2831853+1.0);}
      diffuseColor.rgb=mix(gradientStart,gradientEnd,clamp(gradientT,0.0,1.0));
    `);
  };
}

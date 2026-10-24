import * as THREE from "three";

/** Project onto three object-space planes, so Inflate never inherits a pinched UV field. */
export function useTriplanarMaps(material:THREE.MeshStandardMaterial){
  if(material.userData.triplanarApplied)return;
  material.userData.triplanarApplied=true;
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.customProgramCacheKey=()=>`${key}|inflate-triplanar-v1`;
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);
    const map=material.map!;map.updateMatrix();
    shader.uniforms.uTriplanarTransform={value:map.matrix};
    const varyings="varying vec3 vTexturePosition; varying vec3 vTextureNormal;\n";
    shader.vertexShader=varyings+shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvTexturePosition=position;vTextureNormal=normal;");
    shader.fragmentShader=varyings+"uniform mat3 uTriplanarTransform;\n"+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace("#include <map_fragment>",`
      vec3 blendWeights=pow(abs(normalize(vTextureNormal)),vec3(4.0));
      blendWeights/=max(dot(blendWeights,vec3(1.0)),0.00001);
      vec2 uvX=(uTriplanarTransform*vec3(vTexturePosition.zy/3.0+0.5,1.0)).xy;
      vec2 uvY=(uTriplanarTransform*vec3(vTexturePosition.xz/3.0+0.5,1.0)).xy;
      vec2 uvZ=(uTriplanarTransform*vec3(vTexturePosition.xy/3.0+0.5,1.0)).xy;
      diffuseColor*=texture2D(map,uvX)*blendWeights.x+texture2D(map,uvY)*blendWeights.y+texture2D(map,uvZ)*blendWeights.z;
    `).replace("#include <roughnessmap_fragment>",`
      float roughnessFactor=roughness;
      #ifdef USE_ROUGHNESSMAP
        roughnessFactor*=texture2D(roughnessMap,uvX).g*blendWeights.x+texture2D(roughnessMap,uvY).g*blendWeights.y+texture2D(roughnessMap,uvZ).g*blendWeights.z;
      #endif
    `).replace("#include <normal_fragment_maps>",`
      #ifdef USE_NORMALMAP_TANGENTSPACE
        vec3 nx=texture2D(normalMap,uvX).xyz*2.0-1.0;
        vec3 ny=texture2D(normalMap,uvY).xyz*2.0-1.0;
        vec3 nz=texture2D(normalMap,uvZ).xyz*2.0-1.0;
        nx.xy*=normalScale;ny.xy*=normalScale;nz.xy*=normalScale;
        normal=normalize((getTangentFrame(-vViewPosition,normal,uvX)*nx)*blendWeights.x+(getTangentFrame(-vViewPosition,normal,uvY)*ny)*blendWeights.y+(getTangentFrame(-vViewPosition,normal,uvZ)*nz)*blendWeights.z);
      #endif
    `);
  };
}

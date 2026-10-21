import * as THREE from "three";

export const shaderPresets = ["Iridescent", "Plasma", "Hologram", "Satin", "Pearl", "Lava"] as const;
export type ShaderPreset = typeof shaderPresets[number];

// Older libraries and embed links stored ASCII as a material.
export function migrateAppearance<T extends {material:string;effect?:string}>(params:T):T {
  if(["Glow","Night Vision","Emboss"].includes(params.effect??""))params={...params,effect:"None"};
  if(params.material === "ASCII")return {...params,material:"Gloss",effect:"ASCII"};
  return (params.material === "Contour"||params.material === "Voronoi") ? {...params,material:"Gloss"} : params;
}

const patterns:Record<ShaderPreset,string> = {
  Iridescent: `float rim = 1.0 - abs(normalize(vPatternNormal).z);
    vec3 pattern = 0.5 + 0.5 * cos(6.28318 * (rim * 1.8 + vec3(0.0, 0.33, 0.67)));
    diffuseColor.rgb *= mix(vec3(0.3), pattern * 1.5, 0.85);`,
  Plasma: `vec3 p = vPatternPosition * 6.0;
    float wave = sin(p.x + uPatternTime) + sin(p.y * 1.4 - uPatternTime * 0.7) + sin(p.z + sin(p.x + uPatternTime));
    vec3 pattern = 0.5 + 0.5 * cos(wave + vec3(0.0, 2.0, 4.0));
    diffuseColor.rgb *= 0.2 + pattern * 1.4;`,
  Satin: `float grain = sin(vPatternPosition.y * 950.0 + sin(vPatternPosition.x * 17.0) * 2.0);
    float visibleGrain = 1.0 - smoothstep(0.5, 2.0, fwidth(vPatternPosition.y * 950.0));
    diffuseColor.rgb *= 0.62 + grain * visibleGrain * 0.08;`,
  Pearl: `vec3 n = normalize(vPatternNormal);
    float sheen = pow(clamp(1.0 - abs(n.z), 0.0, 1.0), 1.5);
    vec3 pastel = 0.78 + 0.22 * cos(vec3(0.0, 2.1, 4.2) + sheen * 5.0 + vPatternPosition.y * 0.4);
    diffuseColor.rgb *= pastel;`,
  Lava: `vec3 p = vPatternPosition * 4.5;
    p += 0.18 * sin(p.yzx * 1.5 + uPatternTime * 0.3);
    vec2 cell = patternCells(p);
    float crack = 1.0 - smoothstep(0.025, 0.12, cell.y - cell.x);
    vec3 molten = mix(vec3(1.0, 0.08, 0.005), vec3(1.0, 0.7, 0.08), crack);
    vec3 tint = diffuseColor.rgb;
    diffuseColor.rgb *= mix(vec3(0.025), molten * 0.3, crack);
    patternEmission = molten * tint * crack * 2.8 * (0.85 + 0.15 * sin(uPatternTime * 0.8 + p.y));`,
  Hologram: `float rim = pow(1.0 - abs(normalize(vPatternNormal).z), 2.0);
    float scan = 0.5 + 0.5 * sin(vPatternPosition.y * 95.0 - uPatternTime * 3.0);
    diffuseColor.rgb *= mix(vec3(0.08, 0.4, 0.55), vec3(0.45, 1.0, 1.0), max(rim, scan * 0.7));`,
};

const cellularNoise = `
vec3 patternHash(vec3 p) {
  return fract(sin(vec3(dot(p, vec3(127.1,311.7,74.7)), dot(p, vec3(269.5,183.3,246.1)), dot(p, vec3(113.5,271.9,124.6)))) * 43758.5453);
}
vec2 patternCells(vec3 p) {
  vec3 base = floor(p), local = fract(p);
  vec2 nearest = vec2(100.0);
  for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++) {
    vec3 offset = vec3(float(x),float(y),float(z));
    float d = length(offset + patternHash(base + offset) - local);
    if(d < nearest.x) nearest = vec2(d, nearest.x);
    else nearest.y = min(nearest.y, d);
  }
  return nearest;
}
`;

export function createShaderMaterial(preset:ShaderPreset,color:THREE.Color,roughness:number) {
  const material = new THREE.MeshPhysicalMaterial({color,roughness,metalness:preset==="Iridescent"?.55:.12,clearcoat:1});
  if(preset==="Satin"){material.metalness=.85;material.roughness=Math.max(.4,roughness);material.clearcoat=.1;}
  if(preset==="Pearl"){material.metalness=0;material.roughness=Math.max(.18,roughness);material.specularIntensity=.7;material.clearcoat=.8;}
  if(preset==="Lava"){material.metalness=0;material.roughness=Math.max(.8,roughness);material.clearcoat=0;}
  const time = {value:0};
  material.userData.patternTime = time;
  material.customProgramCacheKey = () => preset;
  material.onBeforeCompile = shader => {
    shader.uniforms.uPatternTime = time;
    const varyings = "varying vec3 vPatternPosition; varying vec3 vPatternNormal;\n";
    shader.vertexShader = varyings + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvPatternPosition = position; vPatternNormal = normalize(normalMatrix * normal);");
    shader.fragmentShader = "uniform float uPatternTime;\n" + varyings + (preset==="Lava"?cellularNoise:"") + shader.fragmentShader
      .replace("#include <color_fragment>", "#include <color_fragment>\nvec3 patternEmission = vec3(0.0);\n" + patterns[preset])
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += patternEmission;");
  };
  return material;
}

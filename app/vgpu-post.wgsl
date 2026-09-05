struct Params {
  resolution: vec2f,
  time: f32,
  effectMode: f32,
  intensity: f32,
}

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var sceneSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;

fn sampleScene(uv: vec2f) -> vec4f {
  return textureSample(scene, sceneSampler, clamp(uv, vec2f(0.0), vec2f(1.0)));
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let uv = fragCoord.xy / max(params.resolution, vec2f(1.0));
  let base = sampleScene(uv);
  let amount = clamp(params.intensity, 0.0, 1.0);

  if (params.effectMode < 1.5) {
    let px = 1.0 / max(params.resolution, vec2f(1.0));
    var glow = vec4f(0.0);
    glow += sampleScene(uv + vec2f(px.x * 7.0, 0.0));
    glow += sampleScene(uv - vec2f(px.x * 7.0, 0.0));
    glow += sampleScene(uv + vec2f(0.0, px.y * 7.0));
    glow += sampleScene(uv - vec2f(0.0, px.y * 7.0));
    glow += sampleScene(uv + vec2f(px.x * 18.0, px.y * 12.0));
    glow += sampleScene(uv - vec2f(px.x * 18.0, px.y * 12.0));
    glow *= 0.1667;
    let bloom = base.rgb + max(glow.rgb - vec3f(0.18), vec3f(0.0)) * 3.8 * amount;
    return vec4f(bloom, max(base.a, glow.a * 0.72 * amount));
  }

  let lightness = dot(base.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let contrast = smoothstep(vec3f(0.025), vec3f(0.94), base.rgb);
  let graded = contrast + vec3f(0.02, 0.12, 0.16) * (1.0 - lightness) + vec3f(0.18, 0.07, 0.015) * lightness;
  let vignette = smoothstep(0.88, 0.2, length((uv - 0.5) * vec2f(1.0, params.resolution.y / params.resolution.x)));
  let grain = fract(sin(dot(uv * params.resolution + params.time, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
  let filmic = pow(max(graded, vec3f(0.0)), vec3f(0.88)) * mix(0.68, 1.06, vignette) + grain * 0.045;
  return vec4f(mix(base.rgb, filmic, amount), base.a);
}

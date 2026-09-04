struct Params {
  resolution: vec2f,
  time: f32,
  materialMode: f32,
  effectMode: f32,
  intensity: f32,
  ior: f32,
  transparency: f32,
}

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: Params;

fn sampleScene(uv: vec2f) -> vec4f {
  let dimensions = vec2f(textureDimensions(scene));
  let pixel = vec2i(clamp(uv * dimensions, vec2f(0.0), dimensions - 1.0));
  return textureLoad(scene, pixel, 0);
}

fn luminance(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let texel = 1.0 / params.resolution;
  let base = sampleScene(uv);
  if (base.a < 0.001) { return base; }

  let left = sampleScene(uv - vec2f(texel.x * 2.0, 0.0));
  let right = sampleScene(uv + vec2f(texel.x * 2.0, 0.0));
  let down = sampleScene(uv - vec2f(0.0, texel.y * 2.0));
  let up = sampleScene(uv + vec2f(0.0, texel.y * 2.0));
  let gradient = vec2f(luminance(right.rgb) - luminance(left.rgb), luminance(up.rgb) - luminance(down.rgb));
  let strength = clamp(params.intensity, 0.0, 1.0);
  var color = base.rgb;

  if (params.materialMode == 1.0 || params.effectMode == 1.0) {
    let bend = gradient * (0.012 + (params.ior - 1.0) * 0.025) * strength;
    let refracted = sampleScene(uv + bend);
    let rim = smoothstep(0.02, 0.75, length(gradient));
    color = mix(base.rgb, refracted.rgb, (0.35 + params.transparency * 0.5) * strength);
    color += vec3f(0.16, 0.23, 0.3) * rim * strength;
  }

  if (params.materialMode == 2.0) {
    let phase = dot(uv, vec2f(8.0, 5.0)) + params.time * 0.18 + luminance(color) * 4.0;
    let spectrum = 0.5 + 0.5 * cos(phase + vec3f(0.0, 2.094, 4.188));
    color = mix(color, spectrum, (0.18 + length(gradient) * 0.32) * strength);
  }

  if (params.materialMode == 3.0) {
    let scan = sin((uv.y * params.resolution.y + params.time * 24.0) * 0.12) * 0.5 + 0.5;
    let spectral = vec3f(sampleScene(uv + vec2f(texel.x * 2.5, 0.0)).r, color.g, sampleScene(uv - vec2f(texel.x * 2.5, 0.0)).b);
    color = mix(color, spectral + vec3f(0.04, 0.12, 0.15) * scan, 0.42 * strength);
  }

  if (params.effectMode == 2.0) {
    var glow = vec3f(0.0);
    glow += sampleScene(uv + vec2f(texel.x * 5.0, 0.0)).rgb;
    glow += sampleScene(uv - vec2f(texel.x * 5.0, 0.0)).rgb;
    glow += sampleScene(uv + vec2f(0.0, texel.y * 5.0)).rgb;
    glow += sampleScene(uv - vec2f(0.0, texel.y * 5.0)).rgb;
    glow *= 0.25;
    color += max(glow - vec3f(0.48), vec3f(0.0)) * 1.7 * strength;
  }

  if (params.effectMode == 3.0) {
    let vignette = smoothstep(0.86, 0.2, length((uv - 0.5) * vec2f(1.0, params.resolution.y / params.resolution.x)));
    let grain = fract(sin(dot(uv * params.resolution + params.time, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
    let graded = pow(max(color, vec3f(0.0)), vec3f(0.92)) * vec3f(1.04, 1.0, 0.94);
    color = mix(color, graded * mix(0.82, 1.0, vignette) + grain * 0.018, strength);
  }

  return vec4f(color, base.a);
}

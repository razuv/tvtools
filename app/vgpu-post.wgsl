struct Params {
  resolution: vec2f,
  time: f32,
  materialMode: f32,
  effectMode: f32,
  intensity: f32,
  ior: f32,
  transparency: f32,
  rayAngle: f32,
  rayStrength: f32,
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

fn spectrum(t: f32) -> vec3f {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3f(0.0, 0.333, 0.667)));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let texel = 1.0 / params.resolution;
  let base = sampleScene(uv);
  if (base.a < 0.001 && params.effectMode != 2.0) { return base; }

  let left = sampleScene(uv - vec2f(texel.x * 3.0, 0.0));
  let right = sampleScene(uv + vec2f(texel.x * 3.0, 0.0));
  let down = sampleScene(uv - vec2f(0.0, texel.y * 3.0));
  let up = sampleScene(uv + vec2f(0.0, texel.y * 3.0));
  let gradient = vec2f(right.a - left.a, up.a - down.a);
  let strength = clamp(params.intensity, 0.0, 1.0);
  let ray = clamp(params.rayStrength, 0.0, 1.5);
  let angle = radians(params.rayAngle);
  let direction = vec2f(cos(angle), sin(angle));
  let aspectDirection = normalize(vec2f(direction.x, direction.y * params.resolution.x / params.resolution.y));
  let edge = smoothstep(0.01, 0.72, length(gradient));
  var color = base.rgb;
  var outputAlpha = base.a;

  if (params.materialMode == 1.0 || params.effectMode == 1.0) {
    let bendAmount = (0.010 + (params.ior - 1.0) * 0.045) * (0.35 + ray) * strength;
    let bend = (gradient * 0.8 + aspectDirection * (0.35 + edge)) * bendAmount;
    let red = sampleScene(uv + bend * 1.22).r;
    let green = sampleScene(uv + bend).g;
    let blue = sampleScene(uv + bend * 0.72).b;
    let refracted = vec3f(red, green, blue);
    let beamCoordinate = dot(uv - 0.5, vec2f(-aspectDirection.y, aspectDirection.x));
    let beam = exp(-abs(beamCoordinate - sin(params.time * 0.35) * 0.08) * (28.0 - ray * 12.0));
    let caustic = pow(max(0.0, dot(normalize(gradient + vec2f(0.0001)), aspectDirection)), 5.0);
    color = mix(base.rgb, refracted, (0.50 + params.transparency * 0.42) * strength);
    color += (vec3f(0.12, 0.45, 1.0) * edge + mix(vec3f(0.08, 0.38, 1.0), vec3f(0.75, 0.95, 1.0), beam) * (beam * 1.15 + caustic) * ray) * strength;
  }

  if (params.materialMode == 2.0) {
    let phase = dot(uv - 0.5, aspectDirection) * 2.8 + params.time * 0.055 + luminance(color) * 0.2;
    let spectral = spectrum(fract(phase));
    let band = pow(0.5 + 0.5 * sin(phase * 15.0), 5.0);
    color = mix(color, spectral * (1.0 + band * 0.9), (0.72 + edge * 0.26) * strength);
    color += spectral * edge * 0.65 * strength;
  }

  if (params.materialMode == 3.0) {
    let interference = dot(uv, vec2f(41.0, 23.0)) + sin(uv.y * 38.0 - params.time * 1.7) * 2.5 + params.time * 1.1;
    let foil = spectrum(fract(interference * 0.055));
    let shimmer = pow(0.5 + 0.5 * sin(interference * 1.7), 8.0);
    color = mix(color, foil * (0.68 + shimmer * 1.3), (0.78 + edge * 0.2) * strength);
    color += vec3f(0.35, 0.65, 1.0) * shimmer * 0.55 * strength;
  }

  if (params.effectMode == 2.0) {
    var glow = vec3f(0.0);
    var glowAlpha = 0.0;
    for (var i = 1; i <= 4; i += 1) {
      let radius = f32(i * i) * 2.5;
      let a = sampleScene(uv + vec2f(texel.x * radius, 0.0));
      let b = sampleScene(uv - vec2f(texel.x * radius, 0.0));
      let c = sampleScene(uv + vec2f(0.0, texel.y * radius));
      let d = sampleScene(uv - vec2f(0.0, texel.y * radius));
      glow += a.rgb + b.rgb + c.rgb + d.rgb;
      glowAlpha = max(glowAlpha, max(max(a.a, b.a), max(c.a, d.a)));
    }
    glow *= 0.0625;
    let bloom = max(glow - vec3f(0.24), vec3f(0.0));
    color += bloom * (2.2 + strength * 2.8) * strength;
    outputAlpha = max(base.a, glowAlpha * 0.72 * strength);
  }

  if (params.effectMode == 3.0) {
    let vignette = smoothstep(0.86, 0.2, length((uv - 0.5) * vec2f(1.0, params.resolution.y / params.resolution.x)));
    let grain = fract(sin(dot(uv * params.resolution + params.time, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
    let contrast = smoothstep(vec3f(0.02), vec3f(0.96), color);
    let shadows = vec3f(0.02, 0.12, 0.16) * (1.0 - luminance(contrast));
    let highlights = vec3f(0.18, 0.075, 0.015) * luminance(contrast);
    let graded = pow(max(contrast + shadows + highlights, vec3f(0.0)), vec3f(0.88));
    color = mix(color, graded * mix(0.68, 1.05, vignette) + grain * 0.045, strength);
  }

  return vec4f(max(color, vec3f(0.0)), outputAlpha);
}

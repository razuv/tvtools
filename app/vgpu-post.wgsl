import { fbmPerlin2d } from "@vgpu/wgsl-std/noise/perlin";

struct Params {
  resolution: vec2f,
  time: f32,
  materialMode: f32,
  effectMode: f32,
  intensity: f32,
  ior: f32,
  transparency: f32,
  reflection: f32,
  frost: f32,
  rayAngle: f32,
  rayStrength: f32,
}

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var mask: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: Params;

fn sampleTexture(source: texture_2d<f32>, uv: vec2f) -> vec4f {
  let dimensions = vec2f(textureDimensions(source));
  let pixel = vec2i(clamp(uv * dimensions, vec2f(0.0), dimensions - 1.0));
  return textureLoad(source, pixel, 0);
}

fn sampleScene(uv: vec2f) -> vec4f { return sampleTexture(scene, uv); }
fn sampleMask(uv: vec2f) -> f32 { return sampleTexture(mask, uv).r; }
fn luminance(color: vec3f) -> f32 { return dot(color, vec3f(0.2126, 0.7152, 0.0722)); }
fn spectrum(t: f32) -> vec3f { return 0.5 + 0.5 * cos(6.28318 * (t + vec3f(0.0, 0.333, 0.667))); }

fn frostedScene(uv: vec2f, radius: f32) -> vec3f {
  if (radius < 0.00001) { return sampleScene(uv).rgb; }
  let aspect = params.resolution.y / params.resolution.x;
  let spread = vec2f(radius * aspect, radius);
  var color = sampleScene(uv).rgb * 0.2;
  color += sampleScene(uv + spread * vec2f(0.9239, 0.3827)).rgb * 0.1;
  color += sampleScene(uv + spread * vec2f(-0.9239, -0.3827)).rgb * 0.1;
  color += sampleScene(uv + spread * vec2f(0.3827, 0.9239)).rgb * 0.1;
  color += sampleScene(uv + spread * vec2f(-0.3827, -0.9239)).rgb * 0.1;
  color += sampleScene(uv + spread * vec2f(-0.7071, 0.7071)).rgb * 0.1;
  color += sampleScene(uv + spread * vec2f(0.7071, -0.7071)).rgb * 0.1;
  color += sampleScene(uv + spread * vec2f(0.0, 1.0)).rgb * 0.1;
  color += sampleScene(uv + spread * vec2f(0.0, -1.0)).rgb * 0.1;
  return color;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let texel = 1.0 / params.resolution;
  let base = sampleScene(uv);
  let shape = smoothstep(0.08, 0.88, sampleMask(uv));
  let left = sampleMask(uv - vec2f(texel.x * 3.0, 0.0));
  let right = sampleMask(uv + vec2f(texel.x * 3.0, 0.0));
  let down = sampleMask(uv - vec2f(0.0, texel.y * 3.0));
  let up = sampleMask(uv + vec2f(0.0, texel.y * 3.0));
  let gradient = vec2f(right - left, up - down);
  let edge = smoothstep(0.015, 0.72, length(gradient));
  let strength = clamp(params.intensity, 0.0, 1.0);
  let ray = clamp(params.rayStrength, 0.0, 1.5);
  let angle = radians(params.rayAngle);
  let direction = normalize(vec2f(cos(angle), sin(angle) * params.resolution.x / params.resolution.y));
  let perpendicular = vec2f(-direction.y, direction.x);
  var color = base.rgb;
  var outputAlpha = base.a;

  if (params.materialMode == 1.0 || params.effectMode == 1.0) {
    let centered = uv - 0.5;
    let along = dot(centered, direction);
    let across = dot(centered, perpendicular);
    let beamCenter = sin(params.time * 0.22) * 0.025;
    let beam = exp(-abs(across - beamCenter) * mix(72.0, 19.0, min(ray, 1.0)));
    let spectral = spectrum(along * 1.65 - params.time * 0.025);
    let halo = exp(-abs(across - beamCenter) * 8.0) * 0.18;
    color += (spectral * beam * 1.28 + vec3f(0.14, 0.32, 0.85) * halo) * ray * strength * (0.32 + (1.0 - shape) * 0.35);
    outputAlpha = max(outputAlpha, clamp((beam * 0.72 + halo) * ray * strength, 0.0, 0.92));

    let bendAmount = (0.007 + max(params.ior - 1.0, 0.0) * 0.052) * (0.42 + ray * 0.58) * strength;
    let normalDirection = normalize(gradient + direction * 0.16 + vec2f(0.0001));
    let bend = (normalDirection + direction * 0.24) * bendAmount;
    let blurRadius = params.frost * params.frost * 0.018;
    let clearColor = frostedScene(uv + bend, blurRadius);
    let red = frostedScene(uv + bend * 1.32, blurRadius).r;
    let blue = frostedScene(uv + bend * 0.68, blurRadius).b;
    let refracted = vec3f(red, clearColor.g, blue);
    let rim = pow(edge, 0.7);
    let glint = pow(max(0.0, dot(normalDirection, direction)), 8.0);
    let reflection = clamp(params.reflection, 0.0, 1.0);
    let glassMix = (0.42 + params.transparency * 0.48) * (1.0 - params.frost * 0.12);
    var glass = mix(base.rgb, refracted, glassMix);
    glass += vec3f(0.8, 0.93, 1.0) * rim * reflection * 1.15;
    glass += spectral * (glint * 1.35 + beam * 0.42) * ray;
    glass = mix(glass, vec3f(luminance(glass)), params.frost * 0.28);
    color = mix(color, glass, shape * strength);
  }

  if (params.materialMode == 2.0) {
    let drift = vec2f(params.time * 0.018, -params.time * 0.012);
    let warp = fbmPerlin2d(uv * 3.2 + drift, 4, 2.0, 0.52);
    let diagonal = dot(uv, normalize(vec2f(0.82, 0.57))) * 7.0;
    let broadBands = diagonal + warp * 1.35 + sin(uv.y * 7.0 - params.time * 0.12) * 0.22;
    let rainbow = spectrum(broadBands * 0.29);
    let pearl = vec3f(0.87, 0.91, 0.92) + vec3f(0.08, 0.1, 0.12) * luminance(base.rgb);
    let streak = pow(0.5 + 0.5 * sin(broadBands * 5.4), 10.0);
    let softFoil = mix(pearl, rainbow, 0.54 + streak * 0.24);
    let highlight = vec3f(1.0, 0.98, 0.9) * streak * 0.72 + vec3f(0.72, 0.9, 1.0) * edge * 0.28;
    color = mix(color, softFoil + highlight, shape * (0.86 + 0.14 * strength));
  }

  if (params.materialMode == 3.0) {
    let flow = vec2f(params.time * 0.055, -params.time * 0.11);
    let warpA = fbmPerlin2d(uv * 3.0 + flow, 4, 2.0, 0.52);
    let warpB = fbmPerlin2d(uv * 4.2 + vec2f(warpA * 1.3, -warpA) - flow * 0.62, 4, 2.05, 0.5);
    let field = fbmPerlin2d(uv * 7.2 + vec2f(warpA, warpB) * 2.1 + flow, 5, 2.0, 0.52);
    let veins = smoothstep(0.02, 0.58, field + warpB * 0.34);
    let hot = pow(smoothstep(0.38, 0.82, field + warpA * 0.22), 2.2);
    var lava = mix(vec3f(0.008, 0.001, 0.0), vec3f(0.78, 0.028, 0.0), veins);
    lava = mix(lava, vec3f(1.0, 0.78, 0.055), hot);
    lava += vec3f(1.0, 0.12, 0.0) * edge * 0.18;
    color = mix(color, lava, shape);
  }

  if (params.effectMode == 2.0) {
    var glow = vec3f(0.0);
    var glowAlpha = 0.0;
    for (var i = 1; i <= 5; i += 1) {
      let radius = f32(i * i) * 2.2;
      let a = sampleScene(uv + vec2f(texel.x * radius, 0.0));
      let b = sampleScene(uv - vec2f(texel.x * radius, 0.0));
      let c = sampleScene(uv + vec2f(0.0, texel.y * radius));
      let d = sampleScene(uv - vec2f(0.0, texel.y * radius));
      glow += a.rgb + b.rgb + c.rgb + d.rgb;
      glowAlpha = max(glowAlpha, max(max(a.a, b.a), max(c.a, d.a)));
    }
    glow *= 0.05;
    color += max(glow - vec3f(0.16), vec3f(0.0)) * (3.0 + strength * 3.8) * strength;
    outputAlpha = max(base.a, glowAlpha * 0.76 * strength);
  }

  if (params.effectMode == 3.0) {
    let vignette = smoothstep(0.9, 0.18, length((uv - 0.5) * vec2f(1.0, params.resolution.y / params.resolution.x)));
    let grain = fract(sin(dot(uv * params.resolution + params.time, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
    let contrast = smoothstep(vec3f(0.015), vec3f(0.94), color);
    let graded = pow(max(contrast + vec3f(0.018, 0.1, 0.14) * (1.0 - luminance(contrast)) + vec3f(0.16, 0.055, 0.008) * luminance(contrast), vec3f(0.0)), vec3f(0.86));
    color = mix(color, graded * mix(0.62, 1.08, vignette) + grain * 0.052, strength);
  }

  return vec4f(max(color, vec3f(0.0)), outputAlpha);
}

@group(0) @binding(0) var source_tex: texture_2d<f32>;
@group(0) @binding(1) var source_samp: sampler;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> VertexOut {
  let x = f32((index << 1u) & 2u);
  let y = f32(index & 2u);
  var out: VertexOut;
  out.position = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2f(x, y);
  return out;
}

fn srgb_to_linear(value: vec3f) -> vec3f {
  let lo = value / 12.92;
  let hi = pow((value + 0.055) / 1.055, vec3f(2.4));
  return select(hi, lo, value <= vec3f(0.04045));
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let source = textureSample(source_tex, source_samp, uv);
  return vec4f(srgb_to_linear(source.rgb), source.a);
}

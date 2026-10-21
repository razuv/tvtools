@group(0) @binding(0) var inputImage: texture_2d<f32>;
@group(0) @binding(1) var imageSampler: sampler;
@group(0) @binding(2) var<uniform> settings: vec4f;

fn luminance(c:vec3f)->f32{return dot(c,vec3f(0.2126,0.7152,0.0722));}
fn heat(v:f32)->vec3f{
  let cold=mix(vec3f(0.015,0.0,0.06),vec3f(0.18,0.02,0.65),smoothstep(0.0,0.25,v));
  let warm=mix(cold,vec3f(1.0,0.04,0.005),smoothstep(0.2,0.55,v));
  let hot=mix(warm,vec3f(1.0,0.85,0.02),smoothstep(0.5,0.8,v));
  return mix(hot,vec3f(1.0),smoothstep(0.8,1.0,v));
}
@fragment fn fs_main(@builtin(position) pixel:vec4f)->@location(0) vec4f{
  let size=vec2f(textureDimensions(inputImage));
  let uv=pixel.xy/size;
  let base=textureSample(inputImage,imageSampler,uv);
  let value=luminance(base.rgb);
  var result=base.rgb;
  result=heat(clamp(value,0.0,1.0));
  if(value<0.00001){result=base.rgb;}
  return vec4f(mix(base.rgb,result,settings.y)*base.a,base.a);
}

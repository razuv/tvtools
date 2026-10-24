import test from "node:test";
import assert from "node:assert/strict";
import { backgroundFillCss,paintBackgroundFill } from "../app/backgroundFill.ts";
const fill={colorMode:"Solid",color:"#123456",gradientColor:"#abcdef",gradientAngle:90};
function context(){
  const calls=[],stops=[];
  const gradient=kind=>(...args)=>{calls.push([kind,...args]);return {addColorStop:(...stop)=>stops.push(stop)};};
  return {calls,stops,canvas:{width:1024,height:1024},fillStyle:null,fillRect:(...args)=>calls.push(["rect",...args]),createLinearGradient:gradient("linear"),createRadialGradient:gradient("radial"),createConicGradient:gradient("angular")};
}
test("background fills paint solid and each gradient for scene and export",()=>{
  const solid=context();paintBackgroundFill(solid,fill);assert.equal(solid.fillStyle,fill.color);assert.deepEqual(solid.calls,[["rect",0,0,1024,1024]]);
  for(const mode of ["Linear","Radial","Angular"]){
    const ctx=context();paintBackgroundFill(ctx,{...fill,colorMode:mode});
    assert.equal(ctx.calls[0][0],mode.toLowerCase());assert.ok(ctx.calls[0].slice(1).every(Number.isFinite));
    assert.deepEqual(ctx.stops,[[0,fill.color],[1,fill.gradientColor]]);
    assert.match(backgroundFillCss({...fill,colorMode:mode}),/gradient\(/);
  }
  assert.equal(backgroundFillCss(fill),fill.color);
});
test("bad saved colors and angles use valid defaults",()=>{
  const ctx=context();paintBackgroundFill(ctx,{colorMode:"Linear",color:"oops",gradientColor:null,gradientAngle:NaN});
  assert.ok(ctx.calls[0].slice(1).every(Number.isFinite));assert.deepEqual(ctx.stops,[[0,"#E0E0E0"],[1,"#6C5CE7"]]);
});

test("multiple gradient stops keep their positions in preview and export",()=>{
  const stops=[{position:1,color:"#0000FF"},{position:0,color:"#FF0000"},{position:.35,color:"#00FF00"}];
  const ctx=context();paintBackgroundFill(ctx,{...fill,colorMode:"Linear",gradientStops:stops});
  assert.deepEqual(ctx.stops,[[0,"#FF0000"],[.35,"#00FF00"],[1,"#0000FF"]]);
  assert.match(backgroundFillCss({...fill,colorMode:"Angular",gradientStops:stops}),/#00FF00 35%/);
});

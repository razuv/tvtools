import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";

const source=readFileSync(new URL("../app/ColorSpectrum.tsx",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText
  .replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve("react/jsx-runtime")))
  .replaceAll('"react"',JSON.stringify(import.meta.resolve("react")))
  .replaceAll('"react-dom"',JSON.stringify(import.meta.resolve("react-dom")));
const {ColorSpectrum,hexToHsb,hsbToHex,pickerPosition}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("HSB converts primary colors, grayscale and palette colors without drift",()=>{
  for(const hex of ["#FF0000","#00FF00","#0000FF","#FFFFFF","#000000","#808080","#FF5C35","#6C5CE7","#2878FF"]){
    assert.equal(hsbToHex(hexToHsb(hex)),hex);
  }
  assert.deepEqual(hexToHsb("#FF0000"),{h:0,s:100,b:100});
  assert.deepEqual(hexToHsb("#000000"),{h:0,s:0,b:0});
  assert.equal(hsbToHex({h:360,s:100,b:100}),"#FF0000");
  assert.equal(hsbToHex({h:-120,s:120,b:120}),"#0000FF");
});

test("custom picker exposes an accessible dialog trigger instead of a native color input",()=>{
  const html=renderToStaticMarkup(createElement(ColorSpectrum,{label:"Custom color",color:"#FF5C35",onInput:()=>{}}));
  assert.match(html,/aria-label="Custom color"/);
  assert.match(html,/aria-haspopup="dialog"/);
  assert.doesNotMatch(html,/type="color"/);
});

test("dragged picker stays within the viewport",()=>{
  assert.deepEqual(pickerPosition(100,120,256,360,900,700),{left:100,top:120});
  assert.deepEqual(pickerPosition(-100,-200,256,360,900,700),{left:8,top:8});
  assert.deepEqual(pickerPosition(900,700,256,360,900,700),{left:636,top:332});
});

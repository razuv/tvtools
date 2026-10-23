import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source=readFileSync(new URL("../app/ColorSpectrum.tsx",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText
  .replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve("react/jsx-runtime")));
const {ColorSpectrum}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("spectrum previews every movement but saves only the committed color",()=>{
  const previews=[],saved=[];
  const element=ColorSpectrum({label:"Custom color",color:"#000000",onInput:color=>previews.push(color),onCommit:color=>saved.push(color)});
  const input={value:"#000000",onchange:null};
  element.props.ref(input);
  for(const color of ["#112233","#334455","#abcdef"]){
    input.value=color;element.props.onInput({currentTarget:input});
  }
  assert.deepEqual(previews,["#112233","#334455","#ABCDEF"]);
  assert.deepEqual(saved,[]);
  input.onchange();
  assert.deepEqual(saved,["#ABCDEF"]);
});

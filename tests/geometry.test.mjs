import assert from "node:assert/strict";
import test from "node:test";

let result;
globalThis.self={postMessage(value){result=value;}};
await import("../app/geometry.worker.ts");
const defaults={id:1,geometryMode:"Extrude",thickness:42,segments:18,surfaceDetail:5,edge:24,mass:0,revolveAngle:360,revolveEdge:"Outer",inflateAmount:100,inflateDirection:"Outward",bend:0,bulge:0,taper:0,twist:0};
const rectangle={outer:[[-1,-.5],[1,-.5],[1,.5],[-1,.5]],holes:[]};
function build(shapes,options={}){
  self.onmessage({data:{...defaults,shapes,...options}});
  assert.equal(result.error,undefined);
  return result;
}
function volume(positions){let sum=0;for(let i=0;i<positions.length;i+=9){const [ax,ay,az,bx,by,bz,cx,cy,cz]=positions.subarray(i,i+9);sum+=ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx);}return sum/6;}

test("mirrored extrusion keeps outward face winding",()=>{
  const mesh=build([rectangle]);
  assert.ok(volume(mesh.position)>0,"closed exterior must have positive signed volume");
});

test("inflated curved shell has a closed seam and finite smooth normals",()=>{
  const ring=Array.from({length:128},(_,i)=>{const a=i/128*Math.PI*2;return [Math.cos(a),Math.sin(a)];});
  const mesh=build([{outer:ring,holes:[]}],{geometryMode:"Inflate"});
  assert.ok(volume(mesh.position)>0);
  const edges=new Map();const key=(i)=>Array.from(mesh.position.subarray(i,i+3),v=>Math.round(v*1e5)).join(',');
  for(let i=0;i<mesh.position.length;i+=9){const points=[key(i),key(i+3),key(i+6)];for(let j=0;j<3;j++){const edge=[points[j],points[(j+1)%3]].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1);}}
  assert.equal([...edges.values()].filter(count=>count!==2).length,0,"every shell edge must meet two faces");
  for(let i=0;i<mesh.normal.length;i+=3)assert.ok(Math.abs(Math.hypot(...mesh.normal.subarray(i,i+3))-1)<1e-4);
});

test("dense capsule contours do not fall back to the compatibility mesh",()=>{
  const capsule=[];
  for(let i=0;i<=224;i++){const a=-Math.PI/2+i/224*Math.PI;capsule.push([.8+.5*Math.cos(a),.5*Math.sin(a)]);}
  for(let i=0;i<=224;i++){const a=Math.PI/2+i/224*Math.PI;capsule.push([-.8+.5*Math.cos(a),.5*Math.sin(a)]);}
  const warnings=[];const warn=console.warn;console.warn=(...args)=>warnings.push(args);
  try {const mesh=build([{outer:capsule,holes:[]}],{geometryMode:"Inflate"});assert.equal(warnings.length,0);assert.ok(mesh.triangles<150000);assert.ok(volume(mesh.position)>0);} finally {console.warn=warn;}
});

test("revolved shells keep outward winding for either axis edge",()=>{
  for(const revolveEdge of ["Outer","Inner"]){const mesh=build([rectangle],{geometryMode:"Revolve",revolveEdge});assert.ok(volume(mesh.position)>0);}
});

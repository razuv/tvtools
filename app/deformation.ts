import * as THREE from "three";
import {mergeVertices} from "three/addons/utils/BufferGeometryUtils.js";

export type Deformation={bend:number;bulge:number;taper:number;twist:number};
export function xyDeformer(box:THREE.Box3,settings:Deformation,mass=0){
  const hx=Math.max(.001,(box.max.x-box.min.x)/2),hy=Math.max(.001,(box.max.y-box.min.y)/2);
  const cx=(box.min.x+box.max.x)/2,cy=(box.min.y+box.max.y)/2;
  const bend=THREE.MathUtils.degToRad(settings.bend),twist=THREE.MathUtils.degToRad(settings.twist);
  return (sourceX:number,sourceY:number)=>{
    const xn=THREE.MathUtils.clamp((sourceX-cx)/hx,-1,1),yn=THREE.MathUtils.clamp((sourceY-cy)/hy,-1,1);
    let x=cx+(sourceX-cx)*(1+settings.bulge/100*(1-yn*yn)*.36)*(1+settings.taper/100*yn*.38)*(1+mass*.08),y=cy+(sourceY-cy)*(1+settings.bulge/100*(1-xn*xn)*.18)*(1+mass*.08);
    if(Math.abs(bend)>.001)x+=Math.sin(yn*Math.PI*.5)*hx*bend*.25;
    if(Math.abs(twist)>.001){const angle=twist*yn*.34,c=Math.cos(angle),s=Math.sin(angle),dx=x-cx,dy=y-cy;x=cx+dx*c-dy*s;y=cy+dx*s+dy*c;}
    return [x,y];
  };
}

export function deformModel(geometry:THREE.BufferGeometry,settings:Deformation){
  if(!settings.bend&&!settings.bulge&&!settings.taper&&!settings.twist)return geometry;
  geometry.computeBoundingBox();
  const deform=xyDeformer(geometry.boundingBox!,settings);
  // Weld matching source vertices before moving them, retaining normal and UV seams.
  const welded=mergeVertices(geometry,1e-5);
  const vertices=welded.getAttribute("position");
  for(let i=0;i<vertices.count;i++){const [x,y]=deform(vertices.getX(i),vertices.getY(i));vertices.setXY(i,x,y);}
  welded.computeVertexNormals();
  const result=welded.toNonIndexed();welded.dispose();geometry.dispose();
  result.computeBoundingBox();result.computeBoundingSphere();
  return result;
}

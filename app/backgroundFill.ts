import {gradientStops} from "./gradientStops.ts";
import type { GradientSettings } from "./gradientMaterial";

export const backgroundPresets:Record<string,[string,string]>={Noir:["#070707","#272727"],Sky:["#b9dbe5","#e0e5e5"],Sunset:["#ff805c","#5c3b99"],Gallery:["#e9e5db","#9b968c"],Acid:["#b7f34a","#12360c"]};

export type BackgroundFill=GradientSettings & {color:string};

export function backgroundFillCss(fill:BackgroundFill) {
  if(fill.colorMode==="Solid")return fill.color;
  const colors=gradientStops(fill.gradientStops,fill.color,fill.gradientColor).map(stop=>`${stop.color} ${stop.position*100}%`).join(",");
  if(fill.colorMode==="Linear")return `linear-gradient(${90-fill.gradientAngle}deg,${colors})`;
  if(fill.colorMode==="Radial")return `radial-gradient(ellipse closest-side,${colors})`;
  return `conic-gradient(from ${fill.gradientAngle}deg,${colors})`;
}

export function paintBackgroundFill(ctx:CanvasRenderingContext2D,fill:BackgroundFill) {
  const {width,height}=ctx.canvas;
  const first=/^#[0-9a-f]{6}$/i.test(fill.color)?fill.color:"#E0E0E0";
  const second=/^#[0-9a-f]{6}$/i.test(fill.gradientColor)?fill.gradientColor:"#6C5CE7";
  const angle=(Number.isFinite(fill.gradientAngle)?fill.gradientAngle:0)*Math.PI/180;
  if(fill.colorMode==="Solid"){ctx.fillStyle=first;ctx.fillRect(0,0,width,height);return;}
  let gradient:CanvasGradient;
  if(fill.colorMode==="Radial")gradient=ctx.createRadialGradient(width/2,height/2,0,width/2,height/2,Math.min(width,height)/2);
  else if(fill.colorMode==="Angular")gradient=ctx.createConicGradient((angle- Math.PI/2),width/2,height/2);
  else {
    const x=Math.cos(angle),y=-Math.sin(angle),length=Math.abs(width*x)+Math.abs(height*y);
    gradient=ctx.createLinearGradient((width-x*length)/2,(height-y*length)/2,(width+x*length)/2,(height+y*length)/2);
  }
  for(const stop of gradientStops(fill.gradientStops,first,second))gradient.addColorStop(stop.position,stop.color);
  ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
}

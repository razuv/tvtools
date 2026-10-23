import { APCAcontrast, sRGBtoY } from "apca-w3";

export type RGB=readonly [number,number,number];
export const captionOpacity=.5;

export function captionInk(samples:RGB[],alpha=captionOpacity):"black"|"white" {
  const score=(ink:number)=>Math.min(...samples.map(rgb=>{
    const blended=[ink*alpha+rgb[0]*(1-alpha),ink*alpha+rgb[1]*(1-alpha),ink*alpha+rgb[2]*(1-alpha)];
    return Math.abs(APCAcontrast(sRGBtoY(blended),sRGBtoY(rgb)));
  }));
  return score(255)>=score(0)?"white":"black";
}

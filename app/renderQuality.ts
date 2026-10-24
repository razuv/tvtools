export function renderQuality({pixelRatio=1,cores=8,memory=8,mobile=false}:{pixelRatio?:number;cores?:number;memory?:number;mobile?:boolean}){
  const low=mobile||cores<=4||memory<=4;
  return {pixelRatio:Math.min(Math.max(pixelRatio, .75),low?1:1.5),furLayers:low?10:20,shadowSize:low?512:1024,frameInterval:1000/(low?30:60)};
}

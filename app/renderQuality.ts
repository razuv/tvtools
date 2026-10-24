export function renderQuality({pixelRatio=1,cores=8,memory=8,mobile=false}:{pixelRatio?:number;cores?:number;memory?:number;mobile?:boolean}){
  const low=mobile||cores<=4||memory<=4;
  return {pixelRatio:Math.min(Math.max(pixelRatio, .75),low?1:1.5),furLayers:low?6:20,shadowSize:low?512:1024,frameInterval:1000/60};
}

export type FrameLimit=0|30|60;
export function parseFrameLimit(value:string|null):FrameLimit{return value==="0"?0:value==="30"?30:60;}
export function frameInterval(limit:FrameLimit){return limit===0?0:1000/limit;}
export function savedFrameLimit():FrameLimit{try{return parseFrameLimit(localStorage.getItem("playtools-fps-limit"));}catch{return 60;}}

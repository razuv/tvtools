export type QualityLevel="auto"|"low"|"medium"|"high"|"ultra";
export function parseQualityLevel(value:string|null):QualityLevel{return value==="low"||value==="medium"||value==="high"||value==="ultra"?value:"auto";}
export function savedQualityLevel():QualityLevel{try{return parseQualityLevel(localStorage.getItem("playtools-render-quality"));}catch{return "auto";}}
export function renderQuality({pixelRatio=1,cores=8,memory=8,mobile=false,level="auto"}:{pixelRatio?:number;cores?:number;memory?:number;mobile?:boolean;level?:QualityLevel}){
  const resolved=level==="auto"?(mobile||cores<=4||memory<=4?"low":"high"):level;
  const settings={low:{ratio:1,furLayers:6,shadowSize:512},medium:{ratio:1.5,furLayers:16,shadowSize:1024},high:{ratio:2,furLayers:32,shadowSize:2048},ultra:{ratio:3,furLayers:48,shadowSize:4096}}[resolved];
  return {pixelRatio:Math.min(Math.max(pixelRatio,.75),settings.ratio),furLayers:settings.furLayers,shadowSize:settings.shadowSize,frameInterval:1000/60};
}

export type FrameLimit=0|30|60;
export function parseFrameLimit(value:string|null):FrameLimit{return value==="0"?0:value==="30"?30:60;}
export function frameInterval(limit:FrameLimit){return limit===0?0:1000/limit;}
export function savedFrameLimit():FrameLimit{try{return parseFrameLimit(localStorage.getItem("playtools-fps-limit"));}catch{return 60;}}

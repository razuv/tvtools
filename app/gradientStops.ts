export type GradientStop={position:number;color:string};
export function gradientStops(stops:GradientStop[]|undefined,first:string,second:string):GradientStop[]{
  const valid=stops?.filter(stop=>stop&&Number.isFinite(stop.position)&&/^#[0-9a-f]{6}$/i.test(stop.color)).map(stop=>({...stop,position:Math.max(0,Math.min(1,stop.position))})).sort((a,b)=>a.position-b.position);
  return valid&&valid.length>=2?valid:[{position:0,color:/^#[0-9a-f]{6}$/i.test(first)?first:"#E0E0E0"},{position:1,color:/^#[0-9a-f]{6}$/i.test(second)?second:"#6C5CE7"}];
}

export function gradientStopPosition(x:number,left:number,width:number){return Math.max(0,Math.min(1,(x-left)/Math.max(1,width)));}

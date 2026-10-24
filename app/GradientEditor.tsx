import {useRef,useState} from "react";
import {ColorSpectrum} from "./ColorSpectrum";
import {gradientStops,gradientStopPosition,type GradientStop} from "./gradientStops";

export function GradientEditor({stops,first,second,onChange,label}:{stops?:GradientStop[];first:string;second:string;onChange:(stops:GradientStop[])=>void;label:string}){
  const track=useRef<HTMLButtonElement>(null);
  const drag=useRef<{index:number;x:number;moved:boolean}|null>(null);
  const points=stops&&stops.length>=2?stops:gradientStops(undefined,first,second);
  const [added,setAdded]=useState<number|null>(null);
  const colors=gradientStops(points,first,second).map(stop=>`${stop.color} ${stop.position*100}%`).join(",");
  const update=(index:number,change:Partial<GradientStop>)=>onChange(points.map((stop,i)=>i===index?{...stop,...change}:stop));
  return <div className="gradient-editor">
    <button type="button" ref={track} className="gradient-track" aria-label={label} title={label} style={{background:`linear-gradient(to right,${colors})`}} onClick={event=>{
      const rect=event.currentTarget.getBoundingClientRect();
      const position=gradientStopPosition(event.clientX,rect.left,rect.width);
      setAdded(points.length);onChange([...points,{position,color:first}]);
    }}/>
    <div className="gradient-points">{points.map((stop,index)=><span key={index} className="gradient-point custom-color" style={{left:`${stop.position*100}%`,background:stop.color}} onPointerDown={event=>{
      if(event.button!==0||!(event.target as HTMLElement).closest(".color-picker-trigger"))return;
      drag.current={index,x:event.clientX,moved:false};
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    }} onPointerMove={event=>{
      if(!drag.current||drag.current.index!==index||!(event.target as HTMLElement).hasPointerCapture(event.pointerId))return;
      if(Math.abs(event.clientX-drag.current.x)>3)drag.current.moved=true;
      if(!drag.current.moved)return;
      const rect=track.current!.getBoundingClientRect();
      update(index,{position:gradientStopPosition(event.clientX,rect.left,rect.width)});
    }} onPointerUp={event=>{if((event.target as HTMLElement).hasPointerCapture(event.pointerId))(event.target as HTMLElement).releasePointerCapture(event.pointerId);}} onClickCapture={event=>{
      if(drag.current?.moved){event.preventDefault();event.stopPropagation();drag.current=null;}
    }}>
      <ColorSpectrum label={`${label} ${index+1}`} color={stop.color} autoOpen={added===index} onInput={color=>update(index,{color})} headerActions={<button className="gradient-stop-delete" type="button" aria-label="Delete gradient stop" title="Delete gradient stop" disabled={points.length<=2} onClick={()=>{setAdded(null);onChange(points.filter((_,i)=>i!==index));}}>−</button>}>
        <label className="gradient-stop-position"><span>%</span><input type="range" aria-label="Gradient stop position" min={0} max={100} step={1} value={stop.position*100} onChange={event=>update(index,{position:Number(event.currentTarget.value)/100})}/><output>{Math.round(stop.position*100)}</output></label>

      </ColorSpectrum>
    </span>)}</div>
  </div>;
}

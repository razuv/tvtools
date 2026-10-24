import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";

export function hexToHsb(color:string){
  const [r,g,b]=[1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16)/255);
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  const hue=delta===0?0:max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;
  return {h:(hue*60+360)%360,s:max===0?0:delta/max*100,b:max*100};
}
export function hsbToHex({h,s,b}:{h:number;s:number;b:number}){
  const hue=((h%360)+360)%360/60,saturation=Math.min(100,Math.max(0,s))/100,value=Math.min(100,Math.max(0,b))/100;
  const chroma=value*saturation,x=chroma*(1-Math.abs(hue%2-1)),m=value-chroma;
  const rgb=hue<1?[chroma,x,0]:hue<2?[x,chroma,0]:hue<3?[0,chroma,x]:hue<4?[0,x,chroma]:hue<5?[x,0,chroma]:[chroma,0,x];
  return `#${rgb.map(channel=>Math.round((channel+m)*255).toString(16).padStart(2,"0")).join("")}`.toUpperCase();
}

export function pickerPosition(left:number,top:number,width:number,height:number,viewportWidth:number,viewportHeight:number){
  return {left:Math.max(8,Math.min(left,viewportWidth-width-8)),top:Math.max(8,Math.min(top,viewportHeight-height-8))};
}

export function ColorSpectrum({label,color,onInput,onCommit,children,headerActions,autoOpen=false}:{label:string;color:string;onInput:(color:string)=>void;onCommit?:(color:string)=>void;children?:React.ReactNode;headerActions?:React.ReactNode;autoOpen?:boolean}){
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(autoOpen)trigger.current?.click();},[autoOpen]);
  const panel=useRef<HTMLDivElement>(null);
  const drag=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>drag.current?.(),[]);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(panel.current?.matches(":popover-open")&&!panel.current.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))panel.current.hidePopover();};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")panel.current?.hidePopover();};
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
    return ()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
  },[]);
  const [position,setPosition]=useState({left:0,top:0});
  const [hex,setHex]=useState(color);
  const [hsb,setHsb]=useState(()=>hexToHsb(color));
  const update=(next:typeof hsb)=>{setHsb(next);const value=hsbToHex(next);setHex(value);onInput(value);};
  const spectrumPointer=(event:React.PointerEvent<HTMLDivElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    update({...hsb,s:Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100)),b:Math.max(0,Math.min(100,100-(event.clientY-rect.top)/rect.height*100))});
  };
  const commitHex=()=>{if(/^#[0-9A-F]{6}$/i.test(hex)){const next=hexToHsb(hex);setHsb({...next,h:next.s===0?hsb.h:next.h});onInput(hex.toUpperCase());}else setHex(color);};
  return <><button ref={trigger} type="button" className="color-picker-trigger" aria-label={label} aria-haspopup="dialog" onClick={event=>{
    const rect=event.currentTarget.getBoundingClientRect();
    setPosition({left:Math.max(8,Math.min(rect.right-256,window.innerWidth-264)),top:Math.max(8,Math.min(rect.bottom+8,window.innerHeight-450))});
    setHex(color);setHsb(hexToHsb(color));panel.current?.showPopover();
    if(panel.current){const size=panel.current.getBoundingClientRect();setPosition(pickerPosition(rect.right-size.width,rect.bottom+8,size.width,size.height,window.innerWidth,window.innerHeight));}
  }}/>{typeof document!=="undefined"&&createPortal(<div ref={panel} popover="manual" role="dialog" aria-label={label} className="color-picker" style={position} onToggle={event=>{if(event.newState==="closed")onCommit?.(color);}}>
    <div className="color-picker-heading" onPointerDown={event=>{
      if(event.button!==0||(event.target as HTMLElement).closest("button"))return;
      const rect=panel.current!.getBoundingClientRect();
      const x=event.clientX-rect.left,y=event.clientY-rect.top;
      drag.current?.();
      const move=(pointer:PointerEvent)=>setPosition(pickerPosition(pointer.clientX-x,pointer.clientY-y,rect.width,rect.height,window.innerWidth,window.innerHeight));
      const stop=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",stop);window.removeEventListener("pointercancel",stop);drag.current=null;};
      drag.current=stop;
      window.addEventListener("pointermove",move);window.addEventListener("pointerup",stop);window.addEventListener("pointercancel",stop);
      event.preventDefault();event.stopPropagation();
    }}><span>{label}</span><div className="color-picker-header-actions">{headerActions}<button type="button" aria-label="Close" onClick={()=>panel.current?.hidePopover()}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3 3 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button></div></div>
    <div className="color-picker-spectrum" role="group" aria-label="Saturation and brightness" style={{backgroundColor:hsbToHex({h:hsb.h,s:100,b:100})}} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);spectrumPointer(event);}} onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))spectrumPointer(event);}} onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}>
      <span style={{left:`${hsb.s}%`,top:`${100-hsb.b}%`,background:color}}/>
    </div>
    <input className="color-picker-hue" type="range" aria-label="Hue" min={0} max={360} value={hsb.h} onChange={event=>update({...hsb,h:Number(event.currentTarget.value)})}/>
    <label className="color-picker-slider"><input type="range" aria-label="Saturation slider" min={0} max={100} value={hsb.s} style={{background:`linear-gradient(to right,${hsbToHex({...hsb,s:0})},${hsbToHex({...hsb,s:100})})`}} onChange={event=>update({...hsb,s:Number(event.currentTarget.value)})}/></label>
    <label className="color-picker-slider"><input type="range" aria-label="Brightness slider" min={0} max={100} value={hsb.b} style={{background:`linear-gradient(to right,#000,${hsbToHex({...hsb,b:100})})`}} onChange={event=>update({...hsb,b:Number(event.currentTarget.value)})}/></label>
    <div className="color-picker-hsb">{([['h','H',360],['s','S',100],['b','B',100]] as const).map(([key,title,max])=><label key={key}><span>{title}</span><input type="number" aria-label={key==='h'?'Hue degrees':key==='s'?'Saturation':'Brightness'} min={0} max={max} value={Math.round(hsb[key])} onChange={event=>{const value=event.currentTarget.valueAsNumber;if(Number.isFinite(value))update({...hsb,[key]:Math.min(max,Math.max(0,value))});}}/><small>{key==='h'?'°':'%'}</small></label>)}</div>
    {children}
    <label className="color-picker-hex"><span>HEX</span><input aria-label={`${label} HEX`} value={hex} maxLength={7} spellCheck={false} onChange={event=>setHex(event.target.value.toUpperCase())} onBlur={commitHex} onKeyDown={event=>{if(event.key==="Enter"){commitHex();event.currentTarget.blur();}}}/></label>
  </div>,document.body)}</>;
}

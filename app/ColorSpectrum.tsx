export function ColorSpectrum({label,color,onInput,onCommit}:{label:string;color:string;onInput:(color:string)=>void;onCommit?:(color:string)=>void}){
  return <input aria-label={label} type="color" value={color} onInput={event=>onInput(event.currentTarget.value.toUpperCase())} ref={input=>{
    // React onChange also fires during dragging; native change commits the final selection.
    if(input)input.onchange=()=>onCommit?.(input.value.toUpperCase());
  }}/>;
}


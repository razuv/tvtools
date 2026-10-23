export function nextPresetName(names:string[]) {
  const next=names.reduce((max,name)=>Math.max(max,Number(/^Preset (\d+)$/.exec(name)?.[1]??0)),0)+1;
  return `Preset ${next}`;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ThreeStage, type StageHandle } from "./ThreeStage";

type Material = "Gloss" | "Metal" | "Glass" | "Wood" | "Stone" | "Marble" | "Leather" | "Concrete" | "Clay" | "Chrome";
type ShapeParams = { thickness:number;segments:number;surfaceDetail:number;edge:number;mass:number;bend:number;bulge:number;taper:number;twist:number;material:Material;color:string;colorOpacity:number;roughness:number;textureRepeat:number;textureRotation:number;textureTint:number;glassIor:number;glassTransparency:number };
type ShapeItem = { id:string; name:string; source:string|null; blob?:Blob; demo?:boolean; params?:ShapeParams; kind?:"image"|"text"; text?:string; fontUrl?:string; fontName?:string; fontFamily?:string };
type StoredShapeItem = Omit<ShapeItem,"source">;
type StoredLibrary = { version:1; activeShapeId:string; items:StoredShapeItem[] };

const defaultShapeParams:ShapeParams={thickness:42,segments:18,surfaceDetail:3,edge:24,mass:0,bend:0,bulge:0,taper:0,twist:0,material:"Gloss",color:"#E0E0E0",colorOpacity:100,roughness:18,textureRepeat:2,textureRotation:0,textureTint:0,glassIor:1.5,glassTransparency:88};

const materials: { name: Material; note: string }[] = [
  { name: "Gloss", note: "High shine" },
  { name: "Metal", note: "Brushed" },
  { name: "Glass", note: "Clear" },
  { name: "Wood", note: "CC0 texture" },
  { name: "Stone", note: "CC0 texture" },
  { name: "Marble", note: "CC0 texture" },
  { name: "Leather", note: "CC0 texture" },
  { name: "Concrete", note: "CC0 texture" },
  { name: "Clay", note: "Soft matte" },
  { name: "Chrome", note: "Mirror" },
];

const initialPalette = ["#E0E0E0", "#FF5C35", "#6C5CE7", "#F4F1E9", "#2878FF"];
const textureMaterials: Material[] = ["Wood","Stone","Marble","Leather","Concrete"];
const backgrounds = ["Noir","Sky","Sunset","Gallery","Acid"];
const publicAsset = (path:string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/,"")}`;
const googleFonts = [
  {name:"Inter",family:"Inter",url:publicAsset("fonts/inter.ttf")},
  {name:"Space Grotesk",family:"Studio Space",url:publicAsset("fonts/space-grotesk.ttf")},
  {name:"Playfair Display",family:"Studio Playfair",url:publicAsset("fonts/playfair-display.ttf")},
  {name:"Roboto Mono",family:"Studio Mono",url:publicAsset("fonts/roboto-mono.ttf")},
  {name:"Bebas Neue",family:"Studio Bebas",url:publicAsset("fonts/bebas-neue.ttf")},
  {name:"Pacifico",family:"Studio Pacifico",url:publicAsset("fonts/pacifico.ttf")},
];

const demoShape:ShapeItem={id:"demo-rzw",name:"rzw.svg",source:publicAsset("rzw.svg"),demo:true,kind:"image"};
const libraryDatabase="shape3d-studio-library";
const libraryStore="state";

function openLibraryDatabase(){
  return new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open(libraryDatabase,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(libraryStore))request.result.createObjectStore(libraryStore);};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function readStoredLibrary(){
  const database=await openLibraryDatabase();
  return new Promise<StoredLibrary|null>((resolve,reject)=>{
    const transaction=database.transaction(libraryStore,"readonly");
    const request=transaction.objectStore(libraryStore).get("library");
    request.onsuccess=()=>resolve((request.result as StoredLibrary|undefined)??null);
    request.onerror=()=>reject(request.error);
    transaction.oncomplete=()=>database.close();
  });
}

async function writeStoredLibrary(library:StoredLibrary){
  const database=await openLibraryDatabase();
  return new Promise<void>((resolve,reject)=>{
    const transaction=database.transaction(libraryStore,"readwrite");
    transaction.objectStore(libraryStore).put(library,"library");
    transaction.oncomplete=()=>{database.close();resolve();};
    transaction.onerror=()=>{database.close();reject(transaction.error);};
    transaction.onabort=()=>{database.close();reject(transaction.error);};
  });
}

function RangeControl({ label, value, min, max, step=1, suffix="", onChange }:{ label:string; value:number; min:number; max:number; step?:number; suffix?:string; onChange:(value:number)=>void }) {
  const update = (raw:number) => onChange(Math.max(min,Math.min(max,Number.isFinite(raw)?raw:min)));
  const progress=(value-min)/(max-min)*100;
  return <label className="range-control"><span>{label}<span className="number-wrap"><input aria-label={`${label} value`} type="number" min={min} max={max} step={step} value={value} onChange={(e)=>update(+e.target.value)} /><i>{suffix}</i></span></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} style={{background:`linear-gradient(90deg,#e0e0e0 0 ${progress}%,#292929 ${progress}% 100%)`}} onChange={(e)=>onChange(+e.target.value)} /></label>;
}

export default function Home() {
  const [shapeItems, setShapeItems] = useState<ShapeItem[]>([demoShape]);
  const [activeShapeId, setActiveShapeId] = useState("demo-rzw");
  const [libraryReady, setLibraryReady] = useState(false);
  const [sourceMode, setSourceMode] = useState<"image"|"text">("image");
  const [textDraft, setTextDraft] = useState("SHAPE");
  const [fontDraft, setFontDraft] = useState(googleFonts[0].url);
  const [thickness, setThickness] = useState(42);
  const [segments, setSegments] = useState(18);
  const [surfaceDetail, setSurfaceDetail] = useState(3);
  const [edge, setEdge] = useState(24);
  const [mass, setMass] = useState(0);
  const [bend, setBend] = useState(0);
  const [bulge, setBulge] = useState(0);
  const [taper, setTaper] = useState(0);
  const [twist, setTwist] = useState(0);
  const [material, setMaterial] = useState<Material>("Gloss");
  const [color, setColor] = useState("#E0E0E0");
  const [hexDraft, setHexDraft] = useState("#E0E0E0");
  const [paletteColors, setPaletteColors] = useState(initialPalette);
  const [colorOpacity, setColorOpacity] = useState(100);
  const [glassIor, setGlassIor] = useState(1.5);
  const [glassTransparency, setGlassTransparency] = useState(88);
  const [roughness, setRoughness] = useState(18);
  const [light, setLight] = useState(72);
  const [lightX, setLightX] = useState(-3);
  const [lightY, setLightY] = useState(5);
  const [lightZ, setLightZ] = useState(5);
  const [ambientLight, setAmbientLight] = useState(55);
  const [shadowSoftness, setShadowSoftness] = useState(72);
  const [shadowOpacity, setShadowOpacity] = useState(18);
  const [shadows, setShadows] = useState(true);
  const [textureRepeat, setTextureRepeat] = useState(2);
  const [textureRotation, setTextureRotation] = useState(0);
  const [textureTint, setTextureTint] = useState(0);
  const [background, setBackground] = useState("None");
  const [rotation, setRotation] = useState({ x: -16, y: 28, z: -7 });
  const [triangles, setTriangles] = useState(0);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const [interfaceHidden, setInterfaceHidden] = useState(false);
  const [, setHistoryTick] = useState(0);
  const stageRef = useRef<StageHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const backgroundRef = useRef<HTMLInputElement>(null);
  const axisDragRef = useRef<{axis:"x"|"y"|"z";startX:number;startValue:number}|null>(null);
  const clipboardRef = useRef<ShapeParams|null>(null);
  const historyRef = useRef<ShapeParams[]>([]);
  const historyIndexRef = useRef(-1);
  const suppressHistoryRef = useRef(false);
  const cacheWriteRef = useRef<Promise<void>>(Promise.resolve());
  const cacheErrorRef = useRef(false);

  const shapesRef = useRef(shapeItems);
  shapesRef.current=shapeItems;
  const activeShape=shapeItems.find(item=>item.id===activeShapeId)??shapeItems[0];
  const source=activeShape?.source??null;
  const fileName=activeShape?.name??"shape.svg";
  const currentParams:ShapeParams={thickness,segments,surfaceDetail,edge,mass,bend,bulge,taper,twist,material,color,colorOpacity,roughness,textureRepeat,textureRotation,textureTint,glassIor,glassTransparency};
  const paramsSignature=JSON.stringify(currentParams);

  useEffect(()=>{
    let cancelled=false;
    readStoredLibrary().then(saved=>{
      if(cancelled)return;
      const restored=(saved?.items??[]).map(item=>({...item,source:item.blob?URL.createObjectURL(item.blob):null}));
      const items=[demoShape,...restored];
      const target=items.find(item=>item.id===saved?.activeShapeId)??items[0];
      setShapeItems(items);setActiveShapeId(target.id);setSourceMode(target.kind==="text"?"text":"image");
      if(target.kind==="text"){setTextDraft(target.text??"");setFontDraft(target.fontUrl??googleFonts[0].url);}
      const params=target.params??{...defaultShapeParams};applyParams(params);resetHistory(params);
    }).catch(()=>{}).finally(()=>{if(!cancelled)setLibraryReady(true);});
    return()=>{cancelled=true;};
  },[]);

  useEffect(() => () => { shapesRef.current.forEach(item=>{if(item.source?.startsWith("blob:"))URL.revokeObjectURL(item.source);}); }, []);

  useEffect(() => () => { if (background.startsWith("blob:")) URL.revokeObjectURL(background); }, [background]);

  useEffect(()=>{
    const snapshot=JSON.parse(paramsSignature) as ShapeParams;
    if(suppressHistoryRef.current){suppressHistoryRef.current=false;setShapeItems(items=>items.map(item=>item.id===activeShapeId?{...item,params:snapshot}:item));return;}
    const current=historyRef.current[historyIndexRef.current];
    if(!current||JSON.stringify(current)!==paramsSignature){historyRef.current=historyRef.current.slice(0,historyIndexRef.current+1);historyRef.current.push(snapshot);if(historyRef.current.length>100)historyRef.current.shift();historyIndexRef.current=historyRef.current.length-1;setHistoryTick(tick=>tick+1);}
    setShapeItems(items=>items.map(item=>item.id===activeShapeId?{...item,params:snapshot}:item));
  },[paramsSignature,activeShapeId]);

  useEffect(()=>{
    if(!libraryReady)return;
    const timer=window.setTimeout(()=>{
      const items:StoredShapeItem[]=shapeItems.filter(item=>!item.demo).map(({source:_,...item})=>item);
      const snapshot:StoredLibrary={version:1,activeShapeId,items};
      cacheWriteRef.current=cacheWriteRef.current.catch(()=>{}).then(()=>writeStoredLibrary(snapshot)).then(()=>{cacheErrorRef.current=false;}).catch(()=>{
        if(!cacheErrorRef.current){cacheErrorRef.current=true;flash("Could not cache the shape library");}
      });
    },250);
    return()=>window.clearTimeout(timer);
  },[shapeItems,activeShapeId,libraryReady]);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const importFile = (file?: File) => {
    if (!file) return;
    if (!/\.(svg|png)$/i.test(file.name)) {
      flash("SVG and PNG files only");
      return;
    }
    if(file.size>12*1024*1024){flash("File is larger than 12 MB");return;}
    const item:ShapeItem={id:`shape-${Date.now()}-${Math.random().toString(36).slice(2)}`,name:file.name,source:URL.createObjectURL(file),blob:file,params:{...defaultShapeParams},kind:"image"};
    setShapeItems(items=>[...items,item]);
    setActiveShapeId(item.id);
    applyParams(item.params);
    resetHistory(item.params);
    flash("Shape added to the library");
  };

  const createTextShape = () => {
    const value=textDraft.trim();
    if(!value){flash("Enter some text first");return;}
    const font=googleFonts.find(item=>item.url===fontDraft)??googleFonts[0];
    const label=value.replace(/\s+/g," ").slice(0,24);
    const item:ShapeItem={id:`text-${Date.now()}-${Math.random().toString(36).slice(2)}`,name:`${label}.text`,source:null,kind:"text",text:value.slice(0,120),fontUrl:font.url,fontName:font.name,fontFamily:font.family,params:{...defaultShapeParams}};
    setShapeItems(items=>[...items,item]);setActiveShapeId(item.id);applyParams(item.params);resetHistory(item.params);flash("Text shape added to the library");
  };

  const importBackground = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (background.startsWith("blob:")) URL.revokeObjectURL(background);
    setBackground(URL.createObjectURL(file));
    flash("Background uploaded");
  };

  const resetView = () => {
    setRotation({ x: -16, y: 28, z: -7 });
    stageRef.current?.reset();
  };
  const updateAxis=(axis:"x"|"y"|"z",value:number)=>{const next=Math.max(-360,Math.min(360,value));setRotation(current=>({...current,[axis]:next}));stageRef.current?.setRotation(axis,next);};
  const startAxisDrag=(axis:"x"|"y"|"z",event:React.PointerEvent<HTMLDivElement>)=>{if((event.target as HTMLElement).tagName==="INPUT")return;event.currentTarget.setPointerCapture(event.pointerId);axisDragRef.current={axis,startX:event.clientX,startValue:rotation[axis]};};
  const moveAxisDrag=(event:React.PointerEvent<HTMLDivElement>)=>{const drag=axisDragRef.current;if(drag)updateAxis(drag.axis,Math.round((drag.startValue+(event.clientX-drag.startX)*.65)*10)/10);};
  const endAxisDrag=()=>{axisDragRef.current=null;};

  function applyParams(params:ShapeParams,suppress=true){if(suppress)suppressHistoryRef.current=true;setThickness(params.thickness);setSegments(params.segments);setSurfaceDetail(params.surfaceDetail??3);setEdge(params.edge);setMass(params.mass);setBend(params.bend);setBulge(params.bulge);setTaper(params.taper);setTwist(params.twist);setMaterial(params.material);setColor(params.color);setHexDraft(params.color);setColorOpacity(params.colorOpacity);setRoughness(params.roughness);setTextureRepeat(params.textureRepeat);setTextureRotation(params.textureRotation);setTextureTint(params.textureTint);setGlassIor(params.glassIor);setGlassTransparency(params.glassTransparency);}
  function resetHistory(params:ShapeParams){historyRef.current=[{...params}];historyIndexRef.current=0;setHistoryTick(tick=>tick+1);}
  const selectShape=(id:string)=>{const target=shapeItems.find(item=>item.id===id);if(!target||id===activeShapeId)return;const params=target.params??{...defaultShapeParams};setActiveShapeId(id);setSourceMode(target.kind==="text"?"text":"image");if(target.kind==="text"){setTextDraft(target.text??"");setFontDraft(target.fontUrl??googleFonts[0].url);}applyParams(params);resetHistory(params);};
  const deleteShape=(id:string)=>{
    const index=shapeItems.findIndex(item=>item.id===id),target=shapeItems[index];
    if(index<0||target.demo)return;
    if(target.source?.startsWith("blob:"))URL.revokeObjectURL(target.source);
    const remaining=shapeItems.filter(item=>item.id!==id);
    setShapeItems(remaining);
    if(id===activeShapeId){
      const next=remaining[Math.min(index,remaining.length-1)]??demoShape;
      const params=next.params??{...defaultShapeParams};
      setActiveShapeId(next.id);setSourceMode(next.kind==="text"?"text":"image");
      if(next.kind==="text"){setTextDraft(next.text??"");setFontDraft(next.fontUrl??googleFonts[0].url);}
      applyParams(params);resetHistory(params);
    }
    flash("Shape removed from the library");
  };
  const copyParams=()=>{clipboardRef.current={...currentParams};flash("Parameters copied");};
  const pasteParams=()=>{if(!clipboardRef.current){flash("Copy parameters first");return;}applyParams(clipboardRef.current,false);flash("Parameters pasted");};
  const undo=()=>{if(historyIndexRef.current<=0)return;historyIndexRef.current--;applyParams(historyRef.current[historyIndexRef.current]);setHistoryTick(tick=>tick+1);};
  const redo=()=>{if(historyIndexRef.current>=historyRef.current.length-1)return;historyIndexRef.current++;applyParams(historyRef.current[historyIndexRef.current]);setHistoryTick(tick=>tick+1);};

  const resetGeometry = () => { setThickness(42); setSegments(18); setSurfaceDetail(3); setEdge(24); setMass(0); };
  const resetDeform = () => { setBend(0); setBulge(0); setTaper(0); setTwist(0); };
  const resetMaterial = () => { setMaterial("Gloss"); setTextureRepeat(2); setTextureRotation(0); setTextureTint(0); setGlassIor(1.5); setGlassTransparency(88); };
  const resetAppearance = () => { setColor("#E0E0E0"); setHexDraft("#E0E0E0"); setColorOpacity(100); setRoughness(18); };
  const resetLighting = () => { setLight(72); setLightX(-3); setLightY(5); setLightZ(5); setAmbientLight(55); setShadowSoftness(72); setShadowOpacity(18); setShadows(true); };
  const resetBackground = () => setBackground("None");
  const resetAll = () => { resetGeometry(); resetDeform(); resetMaterial(); resetAppearance(); resetLighting(); resetBackground(); resetView(); flash("All parameters reset"); };
  const chooseColor = (next:string, add=false) => { const normalized=next.toUpperCase(); setColor(normalized); setHexDraft(normalized); if(add&&!paletteColors.includes(normalized))setPaletteColors(items=>[...items,normalized]); };
  const commitHex = () => { const value=hexDraft.trim(); if(/^#[0-9A-F]{6}$/i.test(value))chooseColor(value,true); else setHexDraft(color.toUpperCase()); };

  const embedCode = `<iframe src="https://shape3d.site/embed/${fileName.replace(/\W/g, "-")}" width="640" height="640" style="border:0" allow="fullscreen"></iframe>`;

  return (
    <main className={`studio-shell ${interfaceHidden?"interface-hidden":""}`}>
      <section className="workspace">
        <aside className="panel import-panel">
          <div className="panel-heading"><span>01</span><h2>Source</h2></div>
          <div className="source-tabs"><button className={sourceMode==="image"?"active":""} onClick={()=>setSourceMode("image")}>Image</button><button className={sourceMode==="text"?"active":""} onClick={()=>setSourceMode("text")}>Text</button></div>
          {sourceMode==="image"?<button className="dropzone" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); importFile(e.dataTransfer.files[0]); }}>
            <span className="upload-icon">↗</span><strong>Drop your shape</strong><small>SVG or PNG · max 12 MB</small>
          </button>:<div className="text-source"><label><span>Text</span><textarea aria-label="Text to extrude" maxLength={120} rows={3} value={textDraft} style={{fontFamily:(googleFonts.find(item=>item.url===fontDraft)??googleFonts[0]).family}} onChange={event=>setTextDraft(event.target.value)} onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key==="Enter")createTextShape();}}/></label><label><span>Google Font</span><select aria-label="Google Font" value={fontDraft} style={{fontFamily:(googleFonts.find(item=>item.url===fontDraft)??googleFonts[0]).family}} onChange={event=>setFontDraft(event.target.value)}>{googleFonts.map(font=><option key={font.url} value={font.url}>{font.name}</option>)}</select></label><button onClick={createTextShape}>Create text shape <span>↗</span></button><small>Open Font License · ⌘ Enter</small></div>}
          <input ref={fileRef} className="file-input" type="file" accept=".svg,.png,image/svg+xml,image/png" onChange={(e) => importFile(e.target.files?.[0])} />
          <div className="shape-library" aria-label="Shape library">{shapeItems.map(item=><div key={item.id} className="source-card-wrap"><button className={`source-card ${item.id===activeShapeId?"active":""}`} onClick={()=>selectShape(item.id)}><div className={`source-thumb ${item.kind==="text"?"text-thumb":""}`} style={item.kind==="text"?{fontFamily:item.fontFamily}:undefined}>{item.demo?<img src={publicAsset("rzw.svg")} alt=""/>:item.kind==="text"?<span>{item.text?.slice(0,2)}</span>:<span>{item.name.split(".").pop()?.toUpperCase()}</span>}</div><div><strong>{item.name}</strong><small>{item.kind==="text"?item.fontName:item.demo?"Demo vector":"Imported image"}</small></div><span className="ready-dot" title={item.id===activeShapeId?"active":"ready"}/></button>{!item.demo&&<button className="delete-shape" aria-label={`Delete ${item.name}`} title="Delete shape" onClick={()=>deleteShape(item.id)}>×</button>}</div>)}</div>
          <div className="tip"><span>i</span><p>{sourceMode==="text"?"Text becomes real editable 3D outlines, including counters inside letters.":"Transparent shapes with clean edges give the best extrusion."}</p></div>
        </aside>

        <section className="stage" aria-label="3D preview">
          <div className="stage-top">
            <div><span>WEBGL LIVE</span><b>{triangles.toLocaleString("en-US")} TRIANGLES</b></div>
            <div className="stage-actions"><button onClick={undo} disabled={historyIndexRef.current<=0}>↶ Undo</button><button onClick={redo} disabled={historyIndexRef.current>=historyRef.current.length-1}>↷ Redo</button><button onClick={resetView} aria-label="Reset view">↺ Reset view</button><button onClick={()=>setInterfaceHidden(true)}>□ Hide UI</button></div>
          </div>
          <div className="scene">
            <div className="ambient" style={{ opacity: light / 100 }} />
            <ThreeStage ref={stageRef} source={source} fileName={fileName} text={activeShape?.kind==="text"?activeShape.text:undefined} fontUrl={activeShape?.kind==="text"?activeShape.fontUrl:undefined} thickness={thickness} material={material} color={color} colorOpacity={colorOpacity} glassIor={glassIor} glassTransparency={glassTransparency} roughness={roughness} light={light} lightX={lightX} lightY={lightY} lightZ={lightZ} ambientLight={ambientLight} shadowSoftness={shadowSoftness} shadowOpacity={shadowOpacity} shadows={shadows} segments={segments} surfaceDetail={surfaceDetail} edge={edge} mass={mass} bend={bend} bulge={bulge} taper={taper} twist={twist} textureRepeat={textureRepeat} textureRotation={textureRotation} textureTint={textureTint} background={background} onReady={setTriangles} onLoading={setIsRendering} onError={flash} />
            {isRendering&&<div className="model-loader" role="status"><span/><b>Building geometry</b><small>Interface stays responsive</small></div>}
            <div className="drag-hint"><span>↔</span> Drag to orbit · Scroll to zoom</div>
          </div>
          <div className="axis-row">
            {(["x", "y", "z"] as const).map(axis=><div key={axis} className="axis-control" onPointerDown={event=>startAxisDrag(axis,event)} onPointerMove={moveAxisDrag} onPointerUp={endAxisDrag} onPointerCancel={endAxisDrag}><span>{axis.toUpperCase()}</span><input aria-label={`${axis.toUpperCase()} rotation`} type="number" min={-360} max={360} step={1} value={Math.round(rotation[axis]*10)/10} onChange={event=>updateAxis(axis,+event.target.value)}/><i>°</i></div>)}
          </div>
        </section>

        <aside className="panel properties-panel">
          <div className="panel-heading properties-heading"><span>02</span><h2>Properties</h2><button className="reset-all" onClick={resetAll}>↺ Reset all</button></div>
          <div className="parameter-clipboard"><button onClick={copyParams}>Copy Parameters</button><button onClick={pasteParams}>Paste Parameters</button></div>

          <details className="property-section" open>
            <summary><span>Geometry</span><button onClick={(e)=>{e.preventDefault();resetGeometry();}} aria-label="Reset geometry">↺</button></summary>
            <div className="section-body stack-controls">
              <RangeControl label="Thickness" value={thickness} min={8} max={300} suffix="mm" onChange={setThickness}/>
              <RangeControl label="Segments" value={segments} min={3} max={1024} onChange={setSegments}/>
              <RangeControl label="Surface detail" value={surfaceDetail} min={1} max={5} onChange={setSurfaceDetail}/>
              <RangeControl label="Edge" value={edge} min={0} max={300} suffix="%" onChange={setEdge}/>
              <RangeControl label="Mass" value={mass} min={0} max={250} suffix="%" onChange={setMass}/>
            </div>
          </details>

          <details className="property-section" open>
            <summary><span>Deform</span><button onClick={(e)=>{e.preventDefault();resetDeform();}} aria-label="Reset deformation">↺</button></summary>
            <div className="section-body deform-grid">
              <RangeControl label="Bend" value={bend} min={-120} max={120} suffix="°" onChange={setBend}/>
              <RangeControl label="Bulge" value={bulge} min={-50} max={100} suffix="%" onChange={setBulge}/>
              <RangeControl label="Taper" value={taper} min={-100} max={100} suffix="%" onChange={setTaper}/>
              <RangeControl label="Twist" value={twist} min={-180} max={180} suffix="°" onChange={setTwist}/>
            </div>
          </details>

          <details className="property-section" open>
            <summary><span>Material</span><button onClick={(e)=>{e.preventDefault();resetMaterial();}} aria-label="Reset material">↺</button></summary>
            <div className="section-body">
              <div className="control-row"><span>Surface</span><output>{material}</output></div>
              <div className="materials">{materials.map((item) => <button key={item.name} className={material === item.name ? "active" : ""} onClick={() => setMaterial(item.name)}><span className={`material-ball ${item.name.toLowerCase()}`} /><b>{item.name}</b><small>{item.note}</small></button>)}</div>
              {textureMaterials.includes(material) && <div className="texture-controls">
                <div className="texture-credit"><span>CC0</span> Texture by Poly Haven</div>
                <RangeControl label="Repeat" value={textureRepeat} min={.5} max={8} step={.5} suffix="×" onChange={setTextureRepeat}/>
                <RangeControl label="Rotation" value={textureRotation} min={-180} max={180} suffix="°" onChange={setTextureRotation}/>
                <RangeControl label="Color overlay" value={textureTint} min={0} max={100} suffix="%" onChange={setTextureTint}/>
              </div>}
              {material==="Glass"&&<div className="texture-controls glass-controls"><div className="texture-credit"><span>GLASS</span> Physical refraction</div><RangeControl label="Refraction (IOR)" value={glassIor} min={1} max={2.33} step={.01} onChange={setGlassIor}/><RangeControl label="Transparency" value={glassTransparency} min={0} max={100} suffix="%" onChange={setGlassTransparency}/></div>}
            </div>
          </details>

          <details className="property-section" open>
            <summary><span>Appearance</span><button onClick={(e)=>{e.preventDefault();resetAppearance();}} aria-label="Reset appearance">↺</button></summary>
            <div className="section-body">
              <div className="control-row"><span>Color</span><output>{color.toUpperCase()}</output></div>
              <div className="color-row">{paletteColors.map((item) => <button key={item} aria-label={`Set color ${item}`} className={color === item ? "selected" : ""} style={{ background: item }} onClick={() => chooseColor(item)} />)}<label className="custom-color">+<input aria-label="Custom color" type="color" value={color} onChange={(e) => chooseColor(e.target.value)} onBlur={()=>chooseColor(color,true)} /></label></div>
              <label className="hex-control"><span>HEX</span><input aria-label="HEX color" value={hexDraft} maxLength={7} spellCheck={false} onChange={(e)=>setHexDraft(e.target.value.toUpperCase())} onBlur={commitHex} onKeyDown={(e)=>{if(e.key==="Enter"){commitHex();e.currentTarget.blur();}}}/></label>
              <div className="mini-controls">
                <RangeControl label="Roughness" value={roughness} min={0} max={100} suffix="%" onChange={setRoughness}/>
                <RangeControl label="Color opacity" value={colorOpacity} min={0} max={100} suffix="%" onChange={setColorOpacity}/>
              </div>
            </div>
          </details>

          <details className="property-section" open>
            <summary><span>Lighting</span><button onClick={(e)=>{e.preventDefault();resetLighting();}} aria-label="Reset lighting">↺</button></summary>
            <div className="section-body stack-controls">
              <RangeControl label="Strength" value={light} min={0} max={300} suffix="%" onChange={setLight}/>
              <RangeControl label="Ambient" value={ambientLight} min={0} max={150} suffix="%" onChange={setAmbientLight}/>
              <RangeControl label="Shadow softness" value={shadowSoftness} min={0} max={100} suffix="%" onChange={setShadowSoftness}/>
              <RangeControl label="Shadow opacity" value={shadowOpacity} min={0} max={70} suffix="%" onChange={setShadowOpacity}/>
              <div className="light-position">
                <RangeControl label="Light X" value={lightX} min={-10} max={10} step={.1} onChange={setLightX}/>
                <RangeControl label="Light Y" value={lightY} min={-10} max={10} step={.1} onChange={setLightY}/>
                <RangeControl label="Light Z" value={lightZ} min={-10} max={10} step={.1} onChange={setLightZ}/>
              </div>
              <label className="switch-row"><span>Soft shadow</span><input type="checkbox" checked={shadows} onChange={(e)=>setShadows(e.target.checked)}/><i /></label>
            </div>
          </details>

          <details className="property-section" open>
            <summary><span>Background</span><button onClick={(e)=>{e.preventDefault();resetBackground();}} aria-label="Reset background">↺</button></summary>
            <div className="section-body">
              <div className="control-row"><span>Scene</span><output>{background.startsWith("blob:") ? "Custom" : background}</output></div>
              <div className="backgrounds"><button className={background === "None" ? "active none" : "none"} onClick={() => setBackground("None")}><span>×</span><small>None</small></button>{backgrounds.map((item) => <button key={item} className={`${item.toLowerCase()} ${background === item ? "active" : ""}`} onClick={() => setBackground(item)}><span /><small>{item}</small></button>)}<button className={background.startsWith("blob:") ? "active upload-bg" : "upload-bg"} onClick={() => backgroundRef.current?.click()}><span>+</span><small>Upload</small></button></div>
              <input ref={backgroundRef} className="file-input" type="file" accept="image/*" onChange={(e) => importBackground(e.target.files?.[0])} />
            </div>
          </details>
        </aside>
      </section>

      <footer className="exportbar">
        <div className="export-title"><span>03</span><div><b>Ready to export</b><small>{background === "None" ? "Transparent background" : "Background included"} · High quality</small></div></div>
        <div className="export-actions">
          <button onClick={() => { stageRef.current?.exportPng(`${fileName.replace(/\.[^.]+$/, "")}-3d`,false); flash("Transparent PNG exported"); }}><span>↓</span><div><b>PNG</b><small>Transparent</small></div></button>
          <button onClick={() => { stageRef.current?.exportPng(`${fileName.replace(/\.[^.]+$/, "")}-3d-bg`,true); flash("PNG with background exported"); }}><span>▣</span><div><b>PNG + BG</b><small>{background==="None"?"Studio black":"Scene background"}</small></div></button>
          <button onClick={() => setEmbedOpen(true)}><span>&lt;/&gt;</span><div><b>Embed</b><small>Interactive</small></div></button>
          <button className="primary" onClick={() => { stageRef.current?.exportObj(fileName.replace(/\.[^.]+$/, "")); flash("OBJ geometry exported"); }}><span>↗</span><div><b>OBJ</b><small>3D geometry</small></div></button>
        </div>
      </footer>

      {interfaceHidden&&<div className="fullscreen-actions"><button onClick={()=>setInterfaceHidden(false)}>Show UI</button><button onClick={()=>stageRef.current?.exportPng(`${fileName.replace(/\.[^.]+$/,"")}-3d`,false)}>↓ PNG</button><button onClick={()=>stageRef.current?.exportPng(`${fileName.replace(/\.[^.]+$/,"")}-3d-bg`,true)}>▣ PNG + BG</button><button onClick={()=>stageRef.current?.exportObj(fileName.replace(/\.[^.]+$/, ""))}>↗ OBJ</button></div>}

      {embedOpen && <div className="modal-backdrop" onMouseDown={() => setEmbedOpen(false)}><div className="modal" onMouseDown={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setEmbedOpen(false)}>×</button><span className="eyebrow">INTERACTIVE EMBED</span><h3>Put this shape anywhere.</h3><p>Copy the snippet and paste it into your site. The model keeps rotation, material and color settings.</p><pre>{embedCode}</pre><button className="copy-button" onClick={() => { navigator.clipboard.writeText(embedCode); flash("Embed code copied"); }}>Copy embed code</button></div></div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}

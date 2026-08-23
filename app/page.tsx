"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ThreeStage, type StageHandle } from "./ThreeStage";

type BuiltInMaterial = "Gloss" | "Metal" | "Glass" | "Wood" | "Stone" | "Marble" | "Leather" | "Concrete" | "Rubber" | "Clay" | "Chrome" | "ASCII";
type Material = BuiltInMaterial | `Custom:${string}`;
type GeometryMode = "Extrude" | "Revolve" | "Inflate";
type PostEffect = "None" | "Cartoon" | "Sketch" | "Halftone" | "Pixelate" | "Chromatic" | "Duotone" | "Dither" | "Scanlines" | "Glow";
type AsciiCharacterSet = "Letters" | "Numbers" | "Letters + Numbers" | "Arrows & Chevrons" | "Math & Symbols" | "Custom Set";
type Language = "en" | "ru";
type ShapeParams = { geometryMode:GeometryMode;thickness:number;segments:number;surfaceDetail:number;edge:number;mass:number;inflateAmount:number;bend:number;bulge:number;taper:number;twist:number;fontWeight:number;letterSpacing:number;lineSpacing:number;material:Material;color:string;colorOpacity:number;roughness:number;textureRepeat:number;textureRotation:number;textureTint:number;normalStrength:number;glassIor:number;glassTransparency:number;asciiCharacters:number;asciiCharacterSet:AsciiCharacterSet;asciiCustomSet:string;effect:PostEffect;effectIntensity:number;effectBackground:boolean };
type ShapeItem = { id:string; name:string; source:string|null; blob?:Blob; demo?:boolean; params?:ShapeParams; kind?:"image"|"text"; text?:string; fontUrl?:string; fontName?:string; fontFamily?:string; fontBlob?:Blob };
type FontOption = { id:string; name:string; family:string; url:string; blob?:Blob; custom?:boolean };
type CustomMaterial = { id:string; name:string; blob:Blob; source:string; width:number; height:number };
type CustomBackground = { id:string; name:string; blob:Blob; source:string };
type StoredShapeItem = Omit<ShapeItem,"source">;
type StoredCustomMaterial = Omit<CustomMaterial,"source">;
type StoredLibrary = { version:1; activeShapeId:string; items:StoredShapeItem[]; materials?:StoredCustomMaterial[] };

const defaultShapeParams:ShapeParams={geometryMode:"Extrude",thickness:42,segments:18,surfaceDetail:3,edge:24,mass:0,inflateAmount:55,bend:0,bulge:0,taper:0,twist:0,fontWeight:400,letterSpacing:0,lineSpacing:118,material:"Gloss",color:"#E0E0E0",colorOpacity:100,roughness:18,textureRepeat:2,textureRotation:0,textureTint:0,normalStrength:135,glassIor:1.5,glassTransparency:88,asciiCharacters:128,asciiCharacterSet:"Letters + Numbers",asciiCustomSet:" .:-=+*#%@",effect:"None",effectIntensity:70,effectBackground:false};

const ru:Record<string,string>={
  "Source":"Источник","Image":"Изображение","Text":"Текст","Drop your shape":"Перетащите фигуру","Font":"Шрифт","Google Fonts":"Google Fonts","Custom Fonts":"Свои шрифты","Upload font":"Загрузить шрифт","TTF / OTF · max 12 MB":"TTF / OTF · до 12 МБ","Create text shape":"Создать текстовую фигуру","Demo vector":"Демо-вектор","Imported image":"Импортированное изображение",
  "Text becomes real editable 3D outlines, including counters inside letters.":"Текст преобразуется в редактируемые 3D-контуры, включая полости внутри букв.","Transparent shapes with clean edges give the best extrusion.":"Прозрачные фигуры с чистыми краями дают лучший результат экструзии.",
  "Undo":"Отменить","Redo":"Повторить","Reset view":"Сбросить вид","Center object":"Вернуть в центр","Hide UI":"Скрыть UI","Show UI":"Показать UI","TRIANGLES":"ТРЕУГОЛЬНИКОВ","Building geometry":"Создание геометрии","Interface stays responsive":"Интерфейс остаётся доступным","LMB rotate · RMB pan · Scroll zoom":"ЛКМ — вращение · ПКМ — перемещение · Колесо — масштаб",
  "Properties":"Параметры","Reset all":"Сбросить всё","Copy Properties":"Копировать параметры","Paste Properties":"Вставить параметры","Geometry":"Геометрия","Extrude":"Экструзия","Revolve":"Вращение","Inflate":"Надувание","Thickness":"Толщина","Segments":"Сегменты","Surface detail":"Детализация поверхности","Edge":"Фаска","Mass":"Масса","Inflation":"Надувание",
  "Deform":"Деформация","Bend":"Изгиб","Bulge":"Выпуклость","Taper":"Сужение","Twist":"Скручивание","Material":"Материал","Surface":"Поверхность","High shine":"Глянец","Brushed":"Шлифованный","Clear":"Прозрачный","CC0 texture":"Текстура CC0","Soft matte":"Мягкий матовый","Mirror":"Зеркальный","Real-time text":"Текст в реальном времени",
  "Drop JPG material":"Перетащите JPG-материал","Recommended: seamless square 1024×1024, sRGB, ≤ 8 MB":"Рекомендуется: бесшовный квадрат 1024×1024, sRGB, ≤ 8 МБ","Custom diffuse / albedo":"Пользовательский diffuse / albedo","Texture by Poly Haven":"Текстура Poly Haven","Texture by ambientCG":"Текстура ambientCG","Repeat":"Повтор","Rotation":"Вращение","Color overlay":"Наложение цвета","Normal strength":"Сила рельефа","Physical refraction":"Физическая рефракция","Refraction (IOR)":"Рефракция (IOR)","Transparency":"Прозрачность",
  "Characters":"Символы","Character Set":"Набор символов","Letters":"Буквы","Numbers":"Цифры","Letters + Numbers":"Буквы + цифры","Arrows & Chevrons":"Стрелки и шевроны","Math & Symbols":"Математика и символы","Custom Set":"Свой набор","Default ramp":"Стандартная шкала","Real-time character render":"Рендер символов в реальном времени",
  "Typography":"Типографика","Font weight":"Начертание","Letter spacing":"Межбуквенное расстояние","Line spacing":"Межстрочное расстояние","Appearance":"Внешний вид","Color":"Цвет","Roughness":"Шероховатость","Color opacity":"Прозрачность цвета","Effects":"Эффекты","Cartoon":"Мультфильм","Sketch":"Скетч","Halftone":"Растр","Pixelate":"Пикселизация","Chromatic":"Хроматический","Duotone":"Дуотон","Dither":"Дизеринг","Scanlines":"Скан-линии","Glow":"Свечение","Intensity":"Интенсивность","Affect background":"Обрабатывать фон","Post-processing is unavailable for ASCII":"Пост-обработка недоступна для ASCII","Lighting":"Освещение","Strength":"Яркость","Ambient":"Окружение","Shadow softness":"Мягкость тени","Shadow opacity":"Прозрачность тени","Depth":"Глубина","Soft shadow":"Мягкая тень","Background":"Фон","Scene":"Сцена","None":"Нет","Custom":"Пользовательский","Upload":"Загрузить","Noir":"Нуар","Sky":"Небо","Sunset":"Закат","Gallery":"Галерея","Acid":"Кислотный",
  "Gloss":"Глянец","Metal":"Металл","Glass":"Стекло","Wood":"Дерево","Stone":"Камень","Marble":"Мрамор","Leather":"Кожа","Concrete":"Бетон","Rubber":"Резина","Clay":"Глина","Chrome":"Хром",
  "Ready to export":"Готово к экспорту","Transparent background":"Прозрачный фон","Background included":"Фон включён","High quality":"Высокое качество","Transparent":"Прозрачный","Studio black":"Чёрный фон","Scene background":"Фон сцены","Interactive":"Интерактивный","ASCII graphic":"ASCII-графика","3D geometry":"3D-геометрия",
  "Standard":"Стандарт","Diffuse":"Рассеянный","Top Left":"Сверху слева","Right":"Справа","Drag to position light":"Перетащите источник света","Playtools are available on desktop only.":"Playtools доступен только на десктопе.","INTERACTIVE EMBED":"ИНТЕРАКТИВНЫЙ EMBED","Put this shape anywhere.":"Разместите эту фигуру где угодно.","Copy the snippet and paste it into your site. The model keeps rotation, material and color settings.":"Скопируйте код и вставьте его на сайт. Модель сохранит вращение, материал и цвет.","Copy embed code":"Скопировать embed-код",
  "All parameters reset":"Все параметры сброшены","Background uploaded":"Фон загружен","Background removed":"Фон удалён","Copy parameters first":"Сначала скопируйте параметры","Could not cache the shape library":"Не удалось сохранить библиотеку фигур","Could not read this JPG":"Не удалось прочитать JPG","Could not read this font":"Не удалось прочитать шрифт","Embed code copied":"Embed-код скопирован","Enter some text first":"Сначала введите текст","File is larger than 12 MB":"Файл больше 12 МБ","Font is larger than 12 MB":"Шрифт больше 12 МБ","TTF and OTF files only":"Поддерживаются только TTF и OTF","Font added":"Шрифт добавлен","JPG materials only":"Поддерживаются только JPG-материалы","Material is larger than 8 MB":"Материал больше 8 МБ","Parameters copied":"Параметры скопированы","Parameters pasted":"Параметры вставлены","SVG and PNG files only":"Поддерживаются только SVG и PNG","Shape added to the library":"Фигура добавлена в библиотеку","Shape pasted from Figma":"Фигура вставлена из Figma","Clipboard does not contain SVG or PNG":"В буфере обмена нет SVG или PNG","Clipboard access denied":"Нет доступа к буферу обмена","Use Command or Control V to paste from Figma":"Используйте ⌘/Ctrl+V для вставки из Figma","Shape removed from the library":"Фигура удалена из библиотеки","Text shape added to the library":"Текстовая фигура добавлена в библиотеку","Transparent PNG exported":"Прозрачный PNG экспортирован","PNG with background exported":"PNG с фоном экспортирован","ASCII text exported":"ASCII-текст экспортирован","OBJ geometry exported":"OBJ-геометрия экспортирована"
};

const materials: { name: BuiltInMaterial; note: string }[] = [
  { name: "Gloss", note: "High shine" },
  { name: "Metal", note: "Brushed" },
  { name: "Glass", note: "Clear" },
  { name: "Wood", note: "CC0 texture" },
  { name: "Stone", note: "CC0 texture" },
  { name: "Marble", note: "CC0 texture" },
  { name: "Leather", note: "CC0 texture" },
  { name: "Concrete", note: "CC0 texture" },
  { name: "Rubber", note: "CC0 texture" },
  { name: "Clay", note: "Soft matte" },
  { name: "Chrome", note: "Mirror" },
  { name: "ASCII", note: "Real-time text" },
];

const initialPalette = ["#E0E0E0", "#FF5C35", "#6C5CE7", "#F4F1E9", "#2878FF"];
const textureMaterials: BuiltInMaterial[] = ["Wood","Stone","Marble","Leather","Concrete","Rubber"];
const backgrounds = ["Noir","Sky","Sunset","Gallery","Acid"];
const postEffects:{name:PostEffect;symbol:string}[]=[{name:"None",symbol:"×"},{name:"Cartoon",symbol:"◒"},{name:"Sketch",symbol:"✎"},{name:"Halftone",symbol:"⠿"},{name:"Pixelate",symbol:"▦"},{name:"Chromatic",symbol:"RGB"},{name:"Duotone",symbol:"◐"},{name:"Dither",symbol:"░"},{name:"Scanlines",symbol:"≡"},{name:"Glow",symbol:"✦"}];
const asciiCharacterSets:Record<Exclude<AsciiCharacterSet,"Custom Set">,string>={
  Letters:"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  Numbers:"0123456789",
  "Letters + Numbers":"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "Arrows & Chevrons":"‹«←↖↑↗→↘↓↙»›<^>⌃⌄",
  "Math & Symbols":"·−+×÷=≠≈<>≤≥∞∑∏√∫∆∇∂%#*&@",
};
const publicAsset = (path:string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/,"")}`;
const googleFonts:FontOption[] = [
  {id:"inter",name:"Inter",family:"Inter",url:publicAsset("fonts/inter.ttf")},
  {id:"space-grotesk",name:"Space Grotesk",family:"Studio Space",url:publicAsset("fonts/space-grotesk.ttf")},
  {id:"playfair-display",name:"Playfair Display",family:"Studio Playfair",url:publicAsset("fonts/playfair-display.ttf")},
  {id:"roboto-mono",name:"Roboto Mono",family:"Studio Mono",url:publicAsset("fonts/roboto-mono.ttf")},
  {id:"bebas-neue",name:"Bebas Neue",family:"Studio Bebas",url:publicAsset("fonts/bebas-neue.ttf")},
  {id:"pacifico",name:"Pacifico",family:"Studio Pacifico",url:publicAsset("fonts/pacifico.ttf")},
  {id:"montserrat",name:"Montserrat",family:"Studio Montserrat",url:publicAsset("fonts/montserrat.ttf")},
  {id:"rubik",name:"Rubik",family:"Studio Rubik",url:publicAsset("fonts/rubik.ttf")},
  {id:"pt-sans",name:"PT Sans",family:"Studio PT Sans",url:publicAsset("fonts/pt-sans.ttf")},
  {id:"pt-serif",name:"PT Serif",family:"Studio PT Serif",url:publicAsset("fonts/pt-serif.ttf")},
  {id:"arsenal",name:"Arsenal",family:"Studio Arsenal",url:publicAsset("fonts/arsenal.ttf")},
  {id:"russo-one",name:"Russo One",family:"Studio Russo One",url:publicAsset("fonts/russo-one.ttf")},
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

function svgFileFromText(value:string){
  const text=value.trim();
  if(!text)return null;
  let svg="";
  if(/<svg[\s>]/i.test(text)){
    const document=new DOMParser().parseFromString(text,"text/html");
    svg=document.querySelector("svg")?.outerHTML??"";
  }
  if(!svg){
    const document=new DOMParser().parseFromString(text,"text/html");
    const encoded=document.querySelector<HTMLImageElement>('img[src^="data:image/svg+xml"]')?.src;
    if(encoded){
      try{svg=encoded.includes(";base64,")?atob(encoded.split(",",2)[1]):decodeURIComponent(encoded.slice(encoded.indexOf(",")+1));}catch{/* Ignore malformed clipboard data. */}
    }
  }
  return svg?new File([svg],`figma-${Date.now()}.svg`,{type:"image/svg+xml"}):null;
}

function fileFromPasteData(data:DataTransfer){
  for(const type of ["image/svg+xml","text/plain","text/html"]){
    const svg=svgFileFromText(data.getData(type));
    if(svg)return svg;
  }
  const files=Array.from(data.files);
  const vector=files.find(file=>file.type==="image/svg+xml"||/\.svg$/i.test(file.name));
  if(vector)return new File([vector],/\.svg$/i.test(vector.name)?vector.name:`figma-${Date.now()}.svg`,{type:"image/svg+xml"});
  const png=files.find(file=>file.type==="image/png"||/\.png$/i.test(file.name));
  return png?new File([png],/\.png$/i.test(png.name)?png.name:`figma-${Date.now()}.png`,{type:"image/png"}):null;
}

function RangeControl({ label, value, min, max, step=1, suffix="", onChange }:{ label:string; value:number; min:number; max:number; step?:number; suffix?:string; onChange:(value:number)=>void }) {
  const update = (raw:number) => onChange(Math.max(min,Math.min(max,Number.isFinite(raw)?raw:min)));
  const progress=(value-min)/(max-min)*100;
  return <label className="range-control"><span>{label}<span className="number-wrap"><input aria-label={`${label} value`} type="number" min={min} max={max} step={step} value={value} onChange={(e)=>update(+e.target.value)} /><i>{suffix}</i></span></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} style={{background:`linear-gradient(90deg,#e0e0e0 0 ${progress}%,#292929 ${progress}% 100%)`}} onChange={(e)=>onChange(+e.target.value)} /></label>;
}

function ColorSwatch({color,selected,onChoose,onRemove}:{color:string;selected:boolean;onChoose:()=>void;onRemove:()=>void}){
  return <span className="palette-swatch"><button aria-label={`Set color ${color}`} className={selected?"selected":""} style={{background:color}} onClick={onChoose}/><button className="palette-delete" aria-label={`Remove color ${color}`} onPointerDown={(event)=>event.stopPropagation()} onMouseDown={(event)=>event.stopPropagation()} onClick={(event)=>{event.preventDefault();event.stopPropagation();onRemove();}}>×</button></span>;
}

function BackgroundSwatch({item,selected,onChoose,onRemove}:{item:CustomBackground;selected:boolean;onChoose:()=>void;onRemove:()=>void}){
  return <span className="background-item"><button aria-label={`Use ${item.name}`} className={selected?"active":""} onClick={onChoose}><span style={{backgroundImage:`url(${item.source})`}}/><small>{item.name}</small></button><button className="background-delete" aria-label={`Remove ${item.name}`} onPointerDown={(event)=>event.stopPropagation()} onMouseDown={(event)=>event.stopPropagation()} onClick={(event)=>{event.preventDefault();event.stopPropagation();onRemove();}}>×</button></span>;
}

const lightPresets=[
  {name:"Standard",x:-3,y:5,z:5},
  {name:"Diffuse",x:0,y:8,z:2},
  {name:"Top Left",x:-7,y:7,z:4},
  {name:"Right",x:8,y:1,z:4},
];

function LightDirectionControl({x,y,z,onChange,t}:{x:number;y:number;z:number;onChange:(next:{x:number;y:number;z:number})=>void;t:(value:string)=>string}){
  const move=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(event.buttons===0&&event.type!=="pointerdown")return;
    const rect=event.currentTarget.getBoundingClientRect();
    const nextX=Math.max(-10,Math.min(10,((event.clientX-rect.left)/rect.width)*20-10));
    const nextY=Math.max(-10,Math.min(10,10-((event.clientY-rect.top)/rect.height)*20));
    onChange({x:Math.round(nextX*10)/10,y:Math.round(nextY*10)/10,z});
  };
  return <div className="light-editor">
    <div className="light-presets">{lightPresets.map(preset=><button key={preset.name} className={Math.abs(x-preset.x)<.2&&Math.abs(y-preset.y)<.2&&Math.abs(z-preset.z)<.2?"active":""} onClick={()=>onChange(preset)}><i style={{"--lx":`${preset.x}px`,"--ly":`${-preset.y}px`} as React.CSSProperties}/><span>{t(preset.name)}</span></button>)}</div>
    <div className="light-pad" onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);move(event);}} onPointerMove={move}>
      <div className="light-preview" style={{"--light-x":`${x*2.2}px`,"--light-y":`${-y*2.2}px`} as React.CSSProperties}/>
      <span className="light-handle" style={{left:`${(x+10)*5}%`,top:`${(10-y)*5}%`}}/>
      <small>{t("Drag to position light")}</small>
    </div>
  </div>;
}

export default function Home() {
  const [language,setLanguage]=useState<Language>("en");
  const [shapeItems, setShapeItems] = useState<ShapeItem[]>([demoShape]);
  const [customMaterials,setCustomMaterials]=useState<CustomMaterial[]>([]);
  const [activeShapeId, setActiveShapeId] = useState("demo-rzw");
  const [libraryReady, setLibraryReady] = useState(false);
  const [sourceMode, setSourceMode] = useState<"image"|"text">("image");
  const [textDraft, setTextDraft] = useState("SHAPE");
  const [fontDraft, setFontDraft] = useState(googleFonts[0].url);
  const [customFonts,setCustomFonts]=useState<FontOption[]>([]);
  const [geometryMode,setGeometryMode]=useState<GeometryMode>("Extrude");
  const [thickness, setThickness] = useState(42);
  const [segments, setSegments] = useState(18);
  const [surfaceDetail, setSurfaceDetail] = useState(3);
  const [edge, setEdge] = useState(24);
  const [mass, setMass] = useState(0);
  const [inflateAmount,setInflateAmount]=useState(55);
  const [bend, setBend] = useState(0);
  const [bulge, setBulge] = useState(0);
  const [taper, setTaper] = useState(0);
  const [twist, setTwist] = useState(0);
  const [fontWeight,setFontWeight]=useState(400);
  const [letterSpacing,setLetterSpacing]=useState(0);
  const [lineSpacing,setLineSpacing]=useState(118);
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
  const [normalStrength,setNormalStrength]=useState(135);
  const [asciiCharacters,setAsciiCharacters]=useState(128);
  const [asciiCharacterSet,setAsciiCharacterSet]=useState<AsciiCharacterSet>("Letters + Numbers");
  const [asciiCustomSet,setAsciiCustomSet]=useState(" .:-=+*#%@");
  const [effect,setEffect]=useState<PostEffect>("None");
  const [effectIntensity,setEffectIntensity]=useState(70);
  const [effectBackground,setEffectBackground]=useState(false);
  const [background, setBackground] = useState("None");
  const [customBackgrounds,setCustomBackgrounds]=useState<CustomBackground[]>([]);
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
  const [triangles, setTriangles] = useState(0);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const [interfaceHidden, setInterfaceHidden] = useState(false);
  const [, setHistoryTick] = useState(0);
  const stageRef = useRef<StageHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fontRef = useRef<HTMLInputElement>(null);
  const backgroundRef = useRef<HTMLInputElement>(null);
  const materialRef=useRef<HTMLInputElement>(null);
  const axisDragRef = useRef<{axis:"x"|"y"|"z";startX:number;startValue:number}|null>(null);
  const clipboardRef = useRef<ShapeParams|null>(null);
  const historyRef = useRef<ShapeParams[]>([]);
  const historyIndexRef = useRef(-1);
  const suppressHistoryRef = useRef(false);
  const cacheWriteRef = useRef<Promise<void>>(Promise.resolve());
  const cacheErrorRef = useRef(false);
  const backgroundCounterRef=useRef(1);

  const shapesRef = useRef(shapeItems);
  shapesRef.current=shapeItems;
  const materialsRef=useRef(customMaterials);
  materialsRef.current=customMaterials;
  const backgroundsRef=useRef(customBackgrounds);
  backgroundsRef.current=customBackgrounds;
  const fontsRef=useRef(customFonts);
  fontsRef.current=customFonts;
  const activeShape=shapeItems.find(item=>item.id===activeShapeId)??shapeItems[0];
  const source=activeShape?.source??null;
  const fileName=activeShape?.name??"shape.svg";
  const t=useCallback((value:string)=>language==="ru"?(ru[value]??value):value,[language]);
  const flash=useCallback((message:string)=>{setToast(t(message));window.setTimeout(()=>setToast(""),2200);},[t]);
  const currentParams:ShapeParams={geometryMode,thickness,segments,surfaceDetail,edge,mass,inflateAmount,bend,bulge,taper,twist,fontWeight,letterSpacing,lineSpacing,material,color,colorOpacity,roughness,textureRepeat,textureRotation,textureTint,normalStrength,glassIor,glassTransparency,asciiCharacters,asciiCharacterSet,asciiCustomSet,effect,effectIntensity,effectBackground};
  const asciiGlyphs=asciiCharacterSet==="Custom Set"?asciiCustomSet:(asciiCharacterSets[asciiCharacterSet]??asciiCharacterSets["Letters + Numbers"]);
  const activeCustomMaterial=customMaterials.find(item=>material===`Custom:${item.id}`);
  const activeCustomBackground=customBackgrounds.find(item=>item.source===background);
  const fontOptions=[...googleFonts,...customFonts];
  const activeFont=fontOptions.find(item=>item.url===fontDraft)??googleFonts[0];
  const customMaterialUrl=activeCustomMaterial?.source;
  const isTexturedMaterial=textureMaterials.includes(material as BuiltInMaterial)||Boolean(activeCustomMaterial);
  const hasNormalMap=textureMaterials.includes(material as BuiltInMaterial);
  const paramsSignature=JSON.stringify(currentParams);

  useEffect(()=>{const saved=window.localStorage.getItem("playtools-language");if(saved!=="ru"&&saved!=="en")return;const timer=window.setTimeout(()=>setLanguage(saved),0);return()=>window.clearTimeout(timer);},[]);
  useEffect(()=>{window.localStorage.setItem("playtools-language",language);document.documentElement.lang=language;},[language]);

  useEffect(()=>{
    let cancelled=false;
    readStoredLibrary().then(saved=>{
      if(cancelled)return;
      const restoredFontMap=new Map<string,FontOption>();
      const restored=(saved?.items??[]).map(item=>{
        let fontUrl=item.fontUrl;
        if(item.fontBlob){
          const key=`${item.fontName??"Custom font"}:${item.fontBlob.size}:${item.fontBlob.type}`;
          let font=restoredFontMap.get(key);
          if(!font){
            const id=`custom-${key.replace(/[^a-z0-9]+/gi,"-").toLowerCase()}`;
            font={id,name:item.fontName??"Custom font",family:item.fontFamily??`Playtools ${id}`,url:URL.createObjectURL(item.fontBlob),blob:item.fontBlob,custom:true};
            restoredFontMap.set(key,font);
          }
          fontUrl=font.url;
        }
        return {...item,fontUrl,source:item.blob?URL.createObjectURL(item.blob):null};
      });
      const restoredFonts=[...restoredFontMap.values()];
      restoredFonts.forEach(font=>{const face=new FontFace(font.family,`url("${font.url}")`);face.load().then(loaded=>document.fonts.add(loaded)).catch(()=>{});});
      const restoredMaterials=(saved?.materials??[]).map(item=>({...item,source:URL.createObjectURL(item.blob)}));
      const items=[demoShape,...restored];
      const target=items.find(item=>item.id===saved?.activeShapeId)??items[0];
      setShapeItems(items);setCustomFonts(restoredFonts);setCustomMaterials(restoredMaterials);setActiveShapeId(target.id);setSourceMode(target.kind==="text"?"text":"image");
      if(target.kind==="text"){setTextDraft(target.text??"");setFontDraft(target.fontUrl??googleFonts[0].url);}
      const params=target.params??{...defaultShapeParams};applyParams(params);resetHistory(params);
    }).catch(()=>{}).finally(()=>{if(!cancelled)setLibraryReady(true);});
    return()=>{cancelled=true;};
  },[]);

  useEffect(() => () => { shapesRef.current.forEach(item=>{if(item.source?.startsWith("blob:"))URL.revokeObjectURL(item.source);});fontsRef.current.forEach(item=>URL.revokeObjectURL(item.url));materialsRef.current.forEach(item=>URL.revokeObjectURL(item.source));backgroundsRef.current.forEach(item=>URL.revokeObjectURL(item.source)); }, []);

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
      const materials:StoredCustomMaterial[]=customMaterials.map(({source:_,...item})=>item);
      const snapshot:StoredLibrary={version:1,activeShapeId,items,materials};
      cacheWriteRef.current=cacheWriteRef.current.catch(()=>{}).then(()=>writeStoredLibrary(snapshot)).then(()=>{cacheErrorRef.current=false;}).catch(()=>{
        if(!cacheErrorRef.current){cacheErrorRef.current=true;flash("Could not cache the shape library");}
      });
    },250);
    return()=>window.clearTimeout(timer);
  },[shapeItems,customMaterials,activeShapeId,libraryReady,flash]);

  const importFile = useCallback((file?: File,successMessage="Shape added to the library") => {
    if (!file) return;
    if (!/\.(svg|png)$/i.test(file.name)) {
      flash("SVG and PNG files only");
      return;
    }
    if(file.size>12*1024*1024){flash("File is larger than 12 MB");return;}
    const params={...defaultShapeParams};
    const item:ShapeItem={id:`shape-${Date.now()}-${Math.random().toString(36).slice(2)}`,name:file.name,source:URL.createObjectURL(file),blob:file,params,kind:"image"};
    setShapeItems(items=>[...items,item]);
    setActiveShapeId(item.id);
    applyParams(params);
    resetHistory(params);
    flash(successMessage);
  },[flash]);

  useEffect(()=>{
    const handlePaste=(event:ClipboardEvent)=>{
      const target=event.target as HTMLElement|null;
      if(sourceMode!=="image"||target?.closest("input,textarea,select,[contenteditable='true']")||!event.clipboardData)return;
      const file=fileFromPasteData(event.clipboardData);
      if(!file)return;
      event.preventDefault();
      importFile(file,"Shape pasted from Figma");
    };
    window.addEventListener("paste",handlePaste);
    return()=>window.removeEventListener("paste",handlePaste);
  },[sourceMode,importFile]);

  const importFont=async(file?:File)=>{
    if(!file)return;
    if(!/\.(ttf|otf)$/i.test(file.name)){flash("TTF and OTF files only");return;}
    if(file.size>12*1024*1024){flash("Font is larger than 12 MB");return;}
    const id=`font-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const source=URL.createObjectURL(file);
    const name=file.name.replace(/\.(ttf|otf)$/i,"").slice(0,40)||"Custom font";
    const font:FontOption={id,name,family:`Playtools ${id}`,url:source,blob:file,custom:true};
    try{
      const face=new FontFace(font.family,`url("${source}")`);
      const loaded=await face.load();
      document.fonts.add(loaded);
      setCustomFonts(items=>[...items,font]);
      setFontDraft(source);
      flash("Font added");
    }catch{
      URL.revokeObjectURL(source);
      flash("Could not read this font");
    }
  };

  const createTextShape = () => {
    const value=textDraft.trim();
    if(!value){flash("Enter some text first");return;}
    const font=fontOptions.find(item=>item.url===fontDraft)??googleFonts[0];
    const label=value.replace(/\s+/g," ").slice(0,24);
    const params={...defaultShapeParams};
    const item:ShapeItem={id:`text-${Date.now()}-${Math.random().toString(36).slice(2)}`,name:`${label}.text`,source:null,kind:"text",text:value.slice(0,120),fontUrl:font.url,fontName:font.name,fontFamily:font.family,fontBlob:font.blob,params};
    setShapeItems(items=>[...items,item]);setActiveShapeId(item.id);applyParams(params);resetHistory(params);flash("Text shape added to the library");
  };

  const importBackground = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const number=backgroundCounterRef.current++;
    const source=URL.createObjectURL(file);
    const item:CustomBackground={id:`background-${Date.now()}-${Math.random().toString(36).slice(2)}`,name:`Custom ${number}`,blob:file,source};
    setCustomBackgrounds(items=>[...items,item]);
    setBackground(source);
    flash("Background uploaded");
  };

  const deleteBackground=(id:string)=>{
    const target=customBackgrounds.find(item=>item.id===id);
    if(!target)return;
    setCustomBackgrounds(items=>items.filter(item=>item.id!==id));
    if(background===target.source)setBackground("None");
    window.setTimeout(()=>URL.revokeObjectURL(target.source),0);
    flash("Background removed");
  };

  const importMaterial=async(file?:File)=>{
    if(!file)return;
    if(!/\.jpe?g$/i.test(file.name)&&!/^image\/jpeg$/i.test(file.type)){flash("JPG materials only");return;}
    if(file.size>8*1024*1024){flash("Material is larger than 8 MB");return;}
    try{
      const bitmap=await createImageBitmap(file);
      const width=bitmap.width,height=bitmap.height;bitmap.close();
      const id=`material-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const item:CustomMaterial={id,name:file.name.replace(/\.jpe?g$/i,"").slice(0,28)||"Custom JPG",blob:file,source:URL.createObjectURL(file),width,height};
      setCustomMaterials(items=>[...items,item]);setMaterial(`Custom:${id}`);
      flash(width===height&&width>=1024?"Custom material added":"Material added · 1024×1024 square recommended");
    }catch{flash("Could not read this JPG");}
  };

  const resetView = () => {
    setRotation({ x: 0, y: 0, z: 0 });
    stageRef.current?.reset();
  };
  const updateAxis=(axis:"x"|"y"|"z",value:number)=>{const next=Math.max(-360,Math.min(360,value));setRotation(current=>({...current,[axis]:next}));stageRef.current?.setRotation(axis,next);};
  const startAxisDrag=(axis:"x"|"y"|"z",event:React.PointerEvent<HTMLDivElement>)=>{if((event.target as HTMLElement).tagName==="INPUT")return;event.currentTarget.setPointerCapture(event.pointerId);axisDragRef.current={axis,startX:event.clientX,startValue:rotation[axis]};};
  const moveAxisDrag=(event:React.PointerEvent<HTMLDivElement>)=>{const drag=axisDragRef.current;if(drag)updateAxis(drag.axis,Math.round((drag.startValue+(event.clientX-drag.startX)*.65)*10)/10);};
  const endAxisDrag=()=>{axisDragRef.current=null;};

  function applyParams(params:ShapeParams,suppress=true){if(suppress)suppressHistoryRef.current=true;setGeometryMode(params.geometryMode??"Extrude");setThickness(params.thickness);setSegments(params.segments);setSurfaceDetail(params.surfaceDetail??3);setEdge(params.edge);setMass(params.mass);setInflateAmount(params.inflateAmount??55);setBend(params.bend);setBulge(params.bulge);setTaper(params.taper);setTwist(params.twist);setFontWeight(params.fontWeight??400);setLetterSpacing(params.letterSpacing??0);setLineSpacing(params.lineSpacing??118);setMaterial(params.material);setColor(params.color);setHexDraft(params.color);setColorOpacity(params.colorOpacity);setRoughness(params.roughness);setTextureRepeat(params.textureRepeat);setTextureRotation(params.textureRotation);setTextureTint(params.textureTint);setNormalStrength(params.normalStrength??135);setGlassIor(params.glassIor);setGlassTransparency(params.glassTransparency);setAsciiCharacters(params.asciiCharacters??128);setAsciiCharacterSet(params.asciiCharacterSet??"Letters + Numbers");setAsciiCustomSet(params.asciiCustomSet??" .:-=+*#%@");setEffect(params.effect??"None");setEffectIntensity(params.effectIntensity??70);setEffectBackground(params.effectBackground??false);}
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

  const resetGeometry = () => { setGeometryMode("Extrude");setThickness(42); setSegments(18); setSurfaceDetail(3); setEdge(24); setMass(0);setInflateAmount(55); };
  const resetDeform = () => { setBend(0); setBulge(0); setTaper(0); setTwist(0); };
  const resetMaterial = () => { setMaterial("Gloss"); setTextureRepeat(2); setTextureRotation(0); setTextureTint(0); setNormalStrength(135); setGlassIor(1.5); setGlassTransparency(88); setAsciiCharacters(128); setAsciiCharacterSet("Letters + Numbers"); setAsciiCustomSet(" .:-=+*#%@"); };
  const resetAppearance = () => { setColor("#E0E0E0"); setHexDraft("#E0E0E0"); setColorOpacity(100); setRoughness(18); };
  const resetTypography=()=>{setFontWeight(400);setLetterSpacing(0);setLineSpacing(118);};
  const resetEffects = () => { setEffect("None");setEffectIntensity(70);setEffectBackground(false); };
  const resetLighting = () => { setLight(72); setLightX(-3); setLightY(5); setLightZ(5); setAmbientLight(55); setShadowSoftness(72); setShadowOpacity(18); setShadows(true); };
  const resetBackground = () => setBackground("None");
  const resetAll = () => { resetGeometry(); resetDeform();resetTypography(); resetMaterial(); resetAppearance();resetEffects(); resetLighting(); resetBackground(); resetView(); flash("All parameters reset"); };
  const chooseColor = (next:string, add=true) => { const normalized=next.toUpperCase(); setColor(normalized); setHexDraft(normalized); if(add)setPaletteColors(items=>items.includes(normalized)?items:[...items,normalized]); };
  const commitHex = () => { const value=hexDraft.trim(); if(/^#[0-9A-F]{6}$/i.test(value))chooseColor(value,true); else setHexDraft(color.toUpperCase()); };

  const embedCode = `<iframe src="https://shape3d.site/embed/${fileName.replace(/\W/g, "-")}" width="640" height="640" style="border:0" allow="fullscreen"></iframe>`;

  return (
    <main className={`studio-shell ${interfaceHidden?"interface-hidden":""}`}>
      <section className="workspace">
        <aside className="panel import-panel">
          <div className="panel-heading"><span>01</span><h2>{t("Source")}</h2></div>
          <div className="source-tabs"><button className={sourceMode==="image"?"active":""} onClick={()=>setSourceMode("image")}>{t("Image")}</button><button className={sourceMode==="text"?"active":""} onClick={()=>setSourceMode("text")}>{t("Text")}</button></div>
          {sourceMode==="image"?<button className="dropzone" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); importFile(e.dataTransfer.files[0]); }}>
            <span className="upload-icon">↗</span><strong>{t("Drop your shape")}</strong><small>SVG or PNG · max 12 MB</small>
          </button>:<div className="text-source"><label><span>{t("Text")}</span><textarea aria-label={t("Text")} maxLength={120} rows={3} value={textDraft} style={{fontFamily:activeFont.family}} onChange={event=>setTextDraft(event.target.value)} onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key==="Enter")createTextShape();}}/></label><label><span>{t("Font")}</span><select aria-label={t("Font")} value={fontDraft} onChange={event=>setFontDraft(event.target.value)}><optgroup label={t("Google Fonts")}>{googleFonts.map(font=><option key={font.id} value={font.url}>{font.name}</option>)}</optgroup>{customFonts.length>0&&<optgroup label={t("Custom Fonts")}>{customFonts.map(font=><option key={font.id} value={font.url}>{font.name}</option>)}</optgroup>}</select></label><button className="font-upload" onClick={()=>fontRef.current?.click()}><span>＋ {t("Upload font")}</span><small>{t("TTF / OTF · max 12 MB")}</small></button><button className="create-text" onClick={createTextShape}>{t("Create text shape")} <span>↗</span></button><small>{activeFont.custom?"Local font":"Open Font License"} · ⌘ Enter</small></div>}
          <input ref={fileRef} className="file-input" type="file" accept=".svg,.png,image/svg+xml,image/png" onChange={(e) => importFile(e.target.files?.[0])} />
          <input ref={fontRef} className="file-input" type="file" accept=".ttf,.otf,font/ttf,font/otf,application/x-font-ttf,application/x-font-opentype" onChange={event=>{void importFont(event.target.files?.[0]);event.currentTarget.value="";}} />
          <div className="shape-library" aria-label="Shape library">{shapeItems.map(item=><div key={item.id} className="source-card-wrap"><button className={`source-card ${item.id===activeShapeId?"active":""}`} onClick={()=>selectShape(item.id)}><div className={`source-thumb ${item.kind==="text"?"text-thumb":""}`} style={item.kind==="text"?{fontFamily:item.fontFamily}:undefined}>{item.demo?<img src={publicAsset("rzw.svg")} alt=""/>:item.kind==="text"?<span>{item.text?.slice(0,2)}</span>:<span>{item.name.split(".").pop()?.toUpperCase()}</span>}</div><div><strong>{item.name}</strong><small>{item.kind==="text"?item.fontName:t(item.demo?"Demo vector":"Imported image")}</small></div><span className="ready-dot" title={item.id===activeShapeId?"active":"ready"}/></button>{!item.demo&&<button className="delete-shape" aria-label={`Delete ${item.name}`} title="Delete shape" onClick={()=>deleteShape(item.id)}>×</button>}</div>)}</div>
          <div className="tip"><span>i</span><p>{t(sourceMode==="text"?"Text becomes real editable 3D outlines, including counters inside letters.":"Transparent shapes with clean edges give the best extrusion.")}</p></div>
          <a className="author-badge" href="https://razuvaev.me" target="_blank" rel="noreferrer"><img src={publicAsset("rzw.svg")} alt=""/><strong>Alexey Razuvaev</strong></a>
        </aside>

        <section className="stage" aria-label="3D preview">
          <div className="stage-top">
            <div><span>WEBGL LIVE</span><b>{triangles.toLocaleString(language==="ru"?"ru-RU":"en-US")} {t("TRIANGLES")}</b></div>
            <div className="stage-tools"><div className="language-toggle" aria-label="Language"><button className={language==="en"?"active":""} onClick={()=>setLanguage("en")}>EN</button><button className={language==="ru"?"active":""} onClick={()=>setLanguage("ru")}>RU</button></div><div className="stage-actions"><button onClick={undo} disabled={historyIndexRef.current<=0}>↶ {t("Undo")}</button><button onClick={redo} disabled={historyIndexRef.current>=historyRef.current.length-1}>↷ {t("Redo")}</button><button onClick={()=>stageRef.current?.center()} aria-label={t("Center object")}>⊙ {t("Center object")}</button><button onClick={resetView} aria-label={t("Reset view")}>↺ {t("Reset view")}</button><button onClick={()=>setInterfaceHidden(true)}>□ {t("Hide UI")}</button></div></div>
          </div>
          <div className="scene">
            <div className="ambient" style={{ opacity: light / 100 }} />
            <ThreeStage ref={stageRef} source={source} fileName={fileName} text={activeShape?.kind==="text"?activeShape.text:undefined} fontUrl={activeShape?.kind==="text"?activeShape.fontUrl:undefined} fontWeight={fontWeight} letterSpacing={letterSpacing} lineSpacing={lineSpacing} geometryMode={geometryMode} thickness={thickness} material={material} customMaterialUrl={customMaterialUrl} color={color} colorOpacity={colorOpacity} glassIor={glassIor} glassTransparency={glassTransparency} roughness={roughness} light={light} lightX={lightX} lightY={lightY} lightZ={lightZ} ambientLight={ambientLight} shadowSoftness={shadowSoftness} shadowOpacity={shadowOpacity} shadows={shadows} segments={segments} surfaceDetail={surfaceDetail} edge={edge} mass={mass} inflateAmount={inflateAmount} bend={bend} bulge={bulge} taper={taper} twist={twist} textureRepeat={textureRepeat} textureRotation={textureRotation} textureTint={textureTint} normalStrength={normalStrength} asciiCharacters={asciiCharacters} asciiGlyphs={asciiGlyphs} effect={material==="ASCII"?"None":effect} effectIntensity={effectIntensity} effectBackground={effectBackground} background={background} demoSpin={Boolean(activeShape?.demo)} onRotationChange={setRotation} onReady={setTriangles} onLoading={setIsRendering} onError={flash} />
            {isRendering&&<div className="model-loader" role="status"><span/><b>{t("Building geometry")}</b><small>{t("Interface stays responsive")}</small></div>}
            <div className="drag-hint"><span>↔</span> {t("LMB rotate · RMB pan · Scroll zoom")}</div>
          </div>
          <div className="axis-row">
            {(["x", "y", "z"] as const).map(axis=><div key={axis} className="axis-control" onPointerDown={event=>startAxisDrag(axis,event)} onPointerMove={moveAxisDrag} onPointerUp={endAxisDrag} onPointerCancel={endAxisDrag}><span>{axis.toUpperCase()}</span><input aria-label={`${axis.toUpperCase()} rotation`} type="number" min={-360} max={360} step={1} value={Math.round(rotation[axis]*10)/10} onChange={event=>updateAxis(axis,+event.target.value)}/><i>°</i></div>)}
          </div>
        </section>

        <aside className="panel properties-panel">
          <div className="panel-heading properties-heading"><span>02</span><h2>{t("Properties")}</h2><button className="reset-all" onClick={resetAll}>↺ {t("Reset all")}</button></div>
          <div className="parameter-clipboard"><button onClick={copyParams}>{t("Copy Properties")}</button><button onClick={pasteParams}>{t("Paste Properties")}</button></div>

          <details className="property-section" open>
            <summary><span>{t("Geometry")}</span><button onClick={(e)=>{e.preventDefault();resetGeometry();}} aria-label="Reset geometry">↺</button></summary>
            <div className="section-body stack-controls">
              <div className="geometry-modes" role="group" aria-label="Geometry operation">{(["Extrude","Revolve","Inflate"] as GeometryMode[]).map(mode=><button key={mode} className={geometryMode===mode?"active":""} onClick={()=>setGeometryMode(mode)}><i className={mode.toLowerCase()}/><span>{t(mode)}{mode!=="Extrude"&&<em>BETA</em>}</span></button>)}</div>
              {geometryMode!=="Revolve"&&<RangeControl label={t("Thickness")} value={thickness} min={1} max={300} suffix={language==="ru"?"мм":"mm"} onChange={setThickness}/>}
              <RangeControl label={t("Segments")} value={segments} min={3} max={1024} onChange={setSegments}/>
              <RangeControl label={t("Surface detail")} value={surfaceDetail} min={1} max={5} onChange={setSurfaceDetail}/>
              {geometryMode!=="Revolve"&&<RangeControl label={t("Edge")} value={edge} min={0} max={300} suffix="%" onChange={setEdge}/>}
              {geometryMode==="Extrude"&&<RangeControl label={t("Mass")} value={mass} min={0} max={250} suffix="%" onChange={setMass}/>}
              {geometryMode==="Inflate"&&<RangeControl label={t("Inflation")} value={inflateAmount} min={0} max={200} suffix="%" onChange={setInflateAmount}/>}
            </div>
          </details>

          {activeShape?.kind==="text"&&<details className="property-section" open>
            <summary><span>{t("Typography")}</span><button onClick={(e)=>{e.preventDefault();resetTypography();}} aria-label="Reset typography">↺</button></summary>
            <div className="section-body stack-controls">
              <RangeControl label={t("Font weight")} value={fontWeight} min={100} max={900} step={100} onChange={setFontWeight}/>
              <RangeControl label={t("Letter spacing")} value={letterSpacing} min={-25} max={100} suffix="%" onChange={setLetterSpacing}/>
              {(activeShape.text??"").includes("\n")&&<RangeControl label={t("Line spacing")} value={lineSpacing} min={60} max={250} suffix="%" onChange={setLineSpacing}/>}
            </div>
          </details>}

          <details className="property-section" open>
            <summary><span>{t("Effects")}</span><button onClick={(e)=>{e.preventDefault();resetEffects();}} aria-label="Reset effects">↺</button></summary>
            <div className="section-body effects-body">
              <div className={`effects-grid ${material==="ASCII"?"disabled":""}`} role="group" aria-label="Post-processing effect">{postEffects.map(item=><button key={item.name} className={effect===item.name?"active":""} disabled={material==="ASCII"} onClick={()=>setEffect(item.name)}><i>{item.symbol}</i><span>{t(item.name)}</span></button>)}</div>
              {material==="ASCII"?<small className="effects-note">{t("Post-processing is unavailable for ASCII")}</small>:effect!=="None"&&<><RangeControl label={t("Intensity")} value={effectIntensity} min={0} max={100} suffix="%" onChange={setEffectIntensity}/><label className="switch-row"><span>{t("Affect background")}</span><input type="checkbox" checked={effectBackground} onChange={event=>setEffectBackground(event.target.checked)}/><i/></label></>}
            </div>
          </details>

          <details className="property-section" open>
            <summary><span>{t("Deform")}</span><button onClick={(e)=>{e.preventDefault();resetDeform();}} aria-label="Reset deformation">↺</button></summary>
            <div className="section-body deform-grid">
              <RangeControl label={t("Bend")} value={bend} min={-120} max={120} suffix="°" onChange={setBend}/>
              <RangeControl label={t("Bulge")} value={bulge} min={-50} max={100} suffix="%" onChange={setBulge}/>
              <RangeControl label={t("Taper")} value={taper} min={-100} max={100} suffix="%" onChange={setTaper}/>
              <RangeControl label={t("Twist")} value={twist} min={-180} max={180} suffix="°" onChange={setTwist}/>
            </div>
          </details>

          <details className="property-section" open>
            <summary><span>{t("Material")}</span><button onClick={(e)=>{e.preventDefault();resetMaterial();}} aria-label="Reset material">↺</button></summary>
            <div className="section-body">
              <div className="control-row"><span>{t("Surface")}</span><output>{activeCustomMaterial?.name??t(material)}</output></div>
              <div className="materials">{materials.map((item) => <button key={item.name} className={material === item.name ? "active" : ""} onClick={() => setMaterial(item.name)}><span className={`material-ball ${item.name.toLowerCase()}`} /><b>{t(item.name)}</b><small>{t(item.note)}</small></button>)}{customMaterials.map(item=><button key={item.id} className={material===`Custom:${item.id}`?"active":""} onClick={()=>setMaterial(`Custom:${item.id}`)}><span className="material-ball custom-jpg" style={{backgroundImage:`url(${item.source})`}}/><b>{item.name}</b><small>{item.width}×{item.height} JPG</small></button>)}</div>
              <button className="material-drop" onClick={()=>materialRef.current?.click()} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();void importMaterial(event.dataTransfer.files[0]);}}><span>＋</span><strong>{t("Drop JPG material")}</strong><small>{t("Recommended: seamless square 1024×1024, sRGB, ≤ 8 MB")}</small></button>
              <input ref={materialRef} className="file-input" type="file" accept=".jpg,.jpeg,image/jpeg" onChange={event=>void importMaterial(event.target.files?.[0])}/>
              {isTexturedMaterial && <div className="texture-controls">
                <div className="texture-credit"><span>{activeCustomMaterial?"JPG":"CC0"}</span> {t(activeCustomMaterial?"Custom diffuse / albedo":material==="Rubber"?"Texture by ambientCG":"Texture by Poly Haven")}</div>
                <RangeControl label={t("Repeat")} value={textureRepeat} min={.5} max={8} step={.5} suffix="×" onChange={setTextureRepeat}/>
                <RangeControl label={t("Rotation")} value={textureRotation} min={-180} max={180} suffix="°" onChange={setTextureRotation}/>
                <RangeControl label={t("Color overlay")} value={textureTint} min={0} max={100} suffix="%" onChange={setTextureTint}/>
                {hasNormalMap&&<RangeControl label={t("Normal strength")} value={normalStrength} min={0} max={250} suffix="%" onChange={setNormalStrength}/>}
              </div>}
              {material==="Glass"&&<div className="texture-controls glass-controls"><div className="texture-credit"><span>GLASS</span> {t("Physical refraction")}</div><RangeControl label={t("Refraction (IOR)")} value={glassIor} min={1} max={2.33} step={.01} onChange={setGlassIor}/><RangeControl label={t("Transparency")} value={glassTransparency} min={0} max={100} suffix="%" onChange={setGlassTransparency}/></div>}
              {material==="ASCII"&&<div className="texture-controls ascii-controls">
                <div className="texture-credit"><span>ASCII</span> {t("Real-time character render")}</div>
                <RangeControl label={t("Characters")} value={asciiCharacters} min={40} max={220} onChange={setAsciiCharacters}/>
                <label className="ascii-set-control"><span>{t("Character Set")}</span><select aria-label="ASCII character set" value={asciiCharacterSet} onChange={event=>setAsciiCharacterSet(event.target.value as AsciiCharacterSet)}>{(["Letters","Numbers","Letters + Numbers","Arrows & Chevrons","Math & Symbols","Custom Set"] as AsciiCharacterSet[]).map(option=><option key={option} value={option}>{t(option)}</option>)}</select></label>
                {asciiCharacterSet==="Custom Set"&&<label className="ascii-set-control"><span>{t("Custom Set")}</span><input aria-label="Custom ASCII characters" value={asciiCustomSet} maxLength={96} placeholder=" .:-=+*#%@" onChange={event=>setAsciiCustomSet(event.target.value.slice(0,96))}/><small>{Array.from(asciiCustomSet).length || t("Default ramp")}</small></label>}
              </div>}
            </div>
          </details>

          <details className="property-section" open>
            <summary><span>{t("Appearance")}</span><button onClick={(e)=>{e.preventDefault();resetAppearance();}} aria-label="Reset appearance">↺</button></summary>
            <div className="section-body">
              <div className="control-row"><span>{t("Color")}</span><output>{color.toUpperCase()}</output></div>
              <div className="color-row">{paletteColors.map((item) => <ColorSwatch key={item} color={item} selected={color===item} onChoose={()=>chooseColor(item)} onRemove={()=>setPaletteColors(items=>items.filter(entry=>entry!==item))}/>)}<label className="custom-color">+<input aria-label="Custom color" type="color" value={color} onInput={(e) => chooseColor(e.currentTarget.value,true)} /></label></div>
              <label className="hex-control"><span>HEX</span><input aria-label="HEX color" value={hexDraft} maxLength={7} spellCheck={false} onChange={(e)=>setHexDraft(e.target.value.toUpperCase())} onBlur={commitHex} onKeyDown={(e)=>{if(e.key==="Enter"){commitHex();e.currentTarget.blur();}}}/></label>
              <div className="mini-controls">
                <RangeControl label={t("Roughness")} value={roughness} min={0} max={100} suffix="%" onChange={setRoughness}/>
                <RangeControl label={t("Color opacity")} value={colorOpacity} min={0} max={100} suffix="%" onChange={setColorOpacity}/>
              </div>
            </div>
          </details>

          <details className="property-section" open>
            <summary><span>{t("Lighting")}</span><button onClick={(e)=>{e.preventDefault();resetLighting();}} aria-label="Reset lighting">↺</button></summary>
            <div className="section-body stack-controls">
              <LightDirectionControl x={lightX} y={lightY} z={lightZ} t={t} onChange={next=>{setLightX(next.x);setLightY(next.y);setLightZ(next.z);}}/>
              <RangeControl label={t("Strength")} value={light} min={0} max={300} suffix="%" onChange={setLight}/>
              <RangeControl label={t("Ambient")} value={ambientLight} min={0} max={150} suffix="%" onChange={setAmbientLight}/>
              <RangeControl label={t("Shadow softness")} value={shadowSoftness} min={0} max={100} suffix="%" onChange={setShadowSoftness}/>
              <RangeControl label={t("Shadow opacity")} value={shadowOpacity} min={0} max={70} suffix="%" onChange={setShadowOpacity}/>
              <div className="light-position"><RangeControl label="X" value={lightX} min={-10} max={10} step={.1} onChange={setLightX}/><RangeControl label="Y" value={lightY} min={-10} max={10} step={.1} onChange={setLightY}/><RangeControl label={t("Depth")} value={lightZ} min={-10} max={10} step={.1} onChange={setLightZ}/></div>
              <label className="switch-row"><span>{t("Soft shadow")}</span><input type="checkbox" checked={shadows} onChange={(e)=>setShadows(e.target.checked)}/><i /></label>
            </div>
          </details>

          <details className="property-section" open>
            <summary><span>{t("Background")}</span><button onClick={(e)=>{e.preventDefault();resetBackground();}} aria-label="Reset background">↺</button></summary>
            <div className="section-body">
              <div className="control-row"><span>{t("Scene")}</span><output>{activeCustomBackground?.name??t(background)}</output></div>
              <div className="backgrounds"><button className={background === "None" ? "active none" : "none"} onClick={() => setBackground("None")}><span>×</span><small>{t("None")}</small></button>{backgrounds.map((item) => <button key={item} className={`${item.toLowerCase()} ${background === item ? "active" : ""}`} onClick={() => setBackground(item)}><span /><small>{t(item)}</small></button>)}{customBackgrounds.map(item=><BackgroundSwatch key={item.id} item={item} selected={background===item.source} onChoose={()=>setBackground(item.source)} onRemove={()=>deleteBackground(item.id)}/>)}<button className="upload-bg" onClick={() => backgroundRef.current?.click()}><span>+</span><small>{t("Upload")}</small></button></div>
              <input ref={backgroundRef} className="file-input" type="file" accept="image/*" onChange={(e) => {importBackground(e.target.files?.[0]);e.currentTarget.value="";}} />
            </div>
          </details>
        </aside>
      </section>

      <footer className="exportbar">
        <div className="export-title"><span>03</span><div><b>{t("Ready to export")}</b><small>{t(background === "None" ? "Transparent background" : "Background included")} · {t("High quality")}</small></div></div>
        <div className={`export-actions ${material==="ASCII"?"ascii-export":""}`}>
          <button onClick={() => { stageRef.current?.exportPng(`${fileName.replace(/\.[^.]+$/, "")}-3d`,false); flash("Transparent PNG exported"); }}><span>↓</span><div><b>PNG</b><small>{t("Transparent")}</small></div></button>
          <button onClick={() => { stageRef.current?.exportPng(`${fileName.replace(/\.[^.]+$/, "")}-3d-bg`,true); flash("PNG with background exported"); }}><span>▣</span><div><b>PNG + BG</b><small>{t(background==="None"?"Studio black":"Scene background")}</small></div></button>
          <button onClick={() => setEmbedOpen(true)}><span>&lt;/&gt;</span><div><b>Embed</b><small>{t("Interactive")}</small></div></button>
          {material==="ASCII"&&<button onClick={()=>{stageRef.current?.exportTxt(`${fileName.replace(/\.[^.]+$/,"")}-ascii`);flash("ASCII text exported");}}><span>≡</span><div><b>TXT</b><small>{t("ASCII graphic")}</small></div></button>}
          <button className="primary" onClick={() => { stageRef.current?.exportObj(fileName.replace(/\.[^.]+$/, "")); flash("OBJ geometry exported"); }}><span>↗</span><div><b>OBJ</b><small>{t("3D geometry")}</small></div></button>
        </div>
      </footer>

      <section className="mobile-gate" aria-label="Desktop only">
        <div className="mobile-logo"><img src={publicAsset("favicon.svg")} alt="Playtools logo"/></div>
        <h1>Playtools</h1>
        <p>{t("Playtools are available on desktop only.")}</p>
        <a className="author-badge" href="https://razuvaev.me" target="_blank" rel="noreferrer"><img src={publicAsset("rzw.svg")} alt=""/><strong>Alexey Razuvaev</strong></a>
      </section>

      {interfaceHidden&&<div className="fullscreen-actions"><button onClick={()=>setInterfaceHidden(false)}>{t("Show UI")}</button><button onClick={()=>stageRef.current?.exportPng(`${fileName.replace(/\.[^.]+$/,"")}-3d`,false)}>↓ PNG</button><button onClick={()=>stageRef.current?.exportPng(`${fileName.replace(/\.[^.]+$/,"")}-3d-bg`,true)}>▣ PNG + BG</button>{material==="ASCII"&&<button onClick={()=>stageRef.current?.exportTxt(`${fileName.replace(/\.[^.]+$/,"")}-ascii`)}>≡ TXT</button>}<button onClick={()=>stageRef.current?.exportObj(fileName.replace(/\.[^.]+$/, ""))}>↗ OBJ</button></div>}

      {embedOpen && <div className="modal-backdrop" onMouseDown={() => setEmbedOpen(false)}><div className="modal" onMouseDown={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setEmbedOpen(false)}>×</button><span className="eyebrow">{t("INTERACTIVE EMBED")}</span><h3>{t("Put this shape anywhere.")}</h3><p>{t("Copy the snippet and paste it into your site. The model keeps rotation, material and color settings.")}</p><pre>{embedCode}</pre><button className="copy-button" onClick={() => { navigator.clipboard.writeText(embedCode); flash("Embed code copied"); }}>{t("Copy embed code")}</button></div></div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}

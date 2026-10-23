"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, ClipboardPasteIcon, FloppyDiskIcon, AddIcon, Remove01Icon, Cancel01Icon, ArrowUpRight01Icon, ArrowDown01Icon, UndoIcon, RedoIcon, RefreshIcon, ViewOffIcon, Target01Icon, InformationCircleIcon, HeartIcon, Image01Icon, CodeIcon, TextIcon, CubeIcon, Rotate360Icon, BubblesIcon, PencilIcon, GridIcon, CircleIcon, ColorsIcon, CheckmarkCircle01Icon } from "@hugeicons/core-free-icons";
import { ColorSpectrum } from "./ColorSpectrum";
import { nextPresetName } from "./presetNames";
import { captionOpacity, captionInk, type RGB } from "./contrast";
import { backgroundPresets, paintBackgroundFill, backgroundFillCss, type BackgroundFill } from "./backgroundFill";
import type { ColorMode } from "./gradientMaterial";
import { migrateAppearance, shaderPresets, type ShaderPreset } from "./shaderMaterials";
import { ThreeStage, type StageHandle } from "./ThreeStage";
import { parseModel } from "./modelImport";

type BuiltInMaterial = "Fur" | "Gloss" | "Metal" | "Glass" | "Wood" | "Stone" | "Marble" | "Leather" | "Concrete" | "Rubber" | "Clay" | "Chrome" | ShaderPreset;
type Material = BuiltInMaterial | `Custom:${string}`;
type GeometryMode = "Extrude" | "Revolve" | "Inflate";
type RevolveEdge = "Outer" | "Inner";
type InflateDirection = "Outward" | "Inward";
type PostEffect = "Thermal" | "ASCII" | "None" | "Cartoon" | "Sketch" | "Halftone" | "Pixelate" | "Chromatic" | "Duotone" | "Dither";
type AsciiCharacterSet = "Letters" | "Numbers" | "Letters + Numbers" | "Arrows & Chevrons" | "Math & Symbols" | "Custom Set";
type Language = "en" | "ru";
type ShapeParams = { geometryMode:GeometryMode;thickness:number;segments:number;surfaceDetail:number;edge:number;mass:number;revolveAngle:number;revolveEdge:RevolveEdge;inflateAmount:number;inflateDirection:InflateDirection;bend:number;bulge:number;taper:number;twist:number;fontWeight:number;letterSpacing:number;lineSpacing:number;material:Material;furLength:number;furDensity:number;color:string;colorMode:ColorMode;gradientColor:string;gradientAngle:number;colorOpacity:number;roughness:number;textureRepeat:number;textureRotation:number;textureTint:number;normalStrength:number;normalMapEnabled:boolean;glassIor:number;glassTransparency:number;asciiCharacters:number;asciiCharacterSet:AsciiCharacterSet;asciiCustomSet:string;effect:PostEffect;effectIntensity:number;effectBlur:number;effectBackground:boolean;duotoneDarkColor:string;duotoneColor:string };
type ShapeItem = { id:string; name:string; source:string|null; blob?:Blob; demo?:boolean; params?:ShapeParams; kind?:"image"|"text"|"object"; text?:string; fontUrl?:string; fontName?:string; fontFamily?:string; fontBlob?:Blob };
type FontOption = { id:string; name:string; family:string; url:string; blob?:Blob; custom?:boolean };
type CustomMaterial = { id:string; name:string; blob:Blob; source:string; width:number; height:number };
type CustomBackground = { id:string; name:string; blob:Blob; source:string };
type StoredShapeItem = Omit<ShapeItem,"source">;
type StoredCustomMaterial = Omit<CustomMaterial,"source">;
type StoredLibrary = { version:1; activeShapeId:string; items:StoredShapeItem[]; materials?:StoredCustomMaterial[] };
type EmbedPayload = {
  version:1;
  shape:{fileName:string;source:string|null;text?:string;fontUrl?:string};
  params:ShapeParams;
  scene:{light:number;lightX:number;lightY:number;lightZ:number;ambientLight:number;shadowSoftness:number;shadowOpacity:number;shadows:boolean;background:string;gravity?:boolean;backgroundFill?:BackgroundFill;camera?:{zoom:number;focalLength:number};rotation:{x:number;y:number;z:number}};
  customMaterialUrl?:string;
};

type SavedPreset={id:string;name:string;params:ShapeParams;scene:EmbedPayload["scene"]};

const defaultShapeParams:ShapeParams={geometryMode:"Extrude",thickness:42,segments:18,surfaceDetail:3,edge:24,mass:0,revolveAngle:360,revolveEdge:"Outer",inflateAmount:55,inflateDirection:"Outward",bend:0,bulge:0,taper:0,twist:0,fontWeight:400,letterSpacing:0,lineSpacing:118,material:"Gloss",furLength:35,furDensity:120,color:"#E0E0E0",colorMode:"Solid",gradientColor:"#6C5CE7",gradientAngle:0,colorOpacity:100,roughness:18,textureRepeat:2,textureRotation:0,textureTint:0,normalStrength:135,normalMapEnabled:true,glassIor:1.5,glassTransparency:100,asciiCharacters:128,asciiCharacterSet:"Letters + Numbers",asciiCustomSet:" .:-=+*#%@",effect:"None",effectIntensity:70,effectBlur:4,effectBackground:false,duotoneDarkColor:"#090C13",duotoneColor:"#FF7A45"};

function blobToDataUrl(blob:Blob){
  return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
}

function base64UrlEncode(bytes:Uint8Array){
  let binary="";for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

function base64UrlDecode(value:string){
  const base64=value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=");
  const binary=atob(base64),bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);return bytes;
}

async function encodeEmbedPayload(payload:EmbedPayload){
  const source=new TextEncoder().encode(JSON.stringify(payload));
  if(typeof CompressionStream!=="undefined"){
    const compressed=await new Response(new Blob([source]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
    return `g.${base64UrlEncode(new Uint8Array(compressed))}`;
  }
  return `j.${base64UrlEncode(source)}`;
}

async function decodeEmbedPayload(value:string){
  const [format,encoded]=value.split(".",2);if(!encoded)throw new Error("Missing embed data");
  const bytes=base64UrlDecode(encoded);
  const json=format==="g"&&typeof DecompressionStream!=="undefined"?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text():new TextDecoder().decode(bytes);
  const payload=JSON.parse(json) as EmbedPayload;if(payload.version!==1)throw new Error("Unsupported embed data");return payload;
}

const ru:Record<string,string>={
  "Fur":"Шерсть","Hair length":"Длина ворса","Hair density":"Густота ворса",
  "Imported model":"Импортированная модель","Create":"Создать","Source":"Источник","Image":"Изображение","Text":"Текст","Drop your shape":"Перетащите фигуру","Figma: Copy as SVG or PNG, then paste":"Figma: Copy as SVG или PNG, затем вставьте","Font":"Шрифт","Google Fonts":"Google Fonts","Custom Fonts":"Свои шрифты","Upload font":"Загрузить шрифт","TTF / OTF · max 12 MB":"TTF / OTF · до 12 МБ","Create text shape":"Создать текстовую фигуру","Demo vector":"Демо-вектор","Imported image":"Импортированное изображение",
  "Text becomes real editable 3D outlines, including counters inside letters.":"Текст преобразуется в редактируемые 3D-контуры, включая полости внутри букв.","Transparent shapes with clean edges give the best extrusion.":"Прозрачные фигуры с чистыми краями дают лучший результат экструзии.","Support the project":"Поддержать проект",
  "Undo":"Отменить","Redo":"Повторить","Reset view":"Сбросить вид","Center object":"Вернуть в центр","Hide UI":"Скрыть UI","Show UI":"Показать UI","TRIANGLES":"ТРЕУГОЛЬНИКОВ","Building geometry":"Создание геометрии","Interface stays responsive":"Интерфейс остаётся доступным","LMB rotate · RMB pan · Scroll zoom":"ЛКМ — вращение · ПКМ — перемещение · Колесо — масштаб",
  "Properties":"Параметры","Reset all":"Сбросить всё","Copy Properties":"Копировать параметры","Paste Properties":"Вставить параметры","Geometry":"Геометрия","Extrude":"Экструзия","Revolve":"Вращение","Inflate":"Надувание","Thickness":"Толщина","Segments":"Сегменты","Surface detail":"Детализация поверхности","Edge":"Фаска","Mass":"Масса","Angle":"Угол","Axis edge":"Край оси","Outer":"Внешний","Inner":"Внутренний","Inflation":"Надувание","Direction":"Направление","Outward":"Наружу","Inward":"Внутрь",
  "Deform":"Деформация","Bend":"Изгиб","Bulge":"Выпуклость","Taper":"Сужение","Twist":"Скручивание","Material":"Материал","Surface":"Поверхность","High shine":"Глянец","Brushed":"Шлифованный","Clear":"Прозрачный","CC0 texture":"Текстура CC0","Soft matte":"Мягкий матовый","Mirror":"Зеркальный","Real-time text":"Текст в реальном времени",
  "Drop JPG material":"Перетащите JPG-материал","Recommended: seamless square 1024×1024, sRGB, ≤ 8 MB":"Рекомендуется: бесшовный квадрат 1024×1024, sRGB, ≤ 8 МБ","Custom diffuse / albedo":"Пользовательский diffuse / albedo","Texture by Poly Haven":"Текстура Poly Haven","Texture by ambientCG":"Текстура ambientCG","Repeat":"Повтор","Rotation":"Вращение","Color overlay":"Наложение цвета","Normal map":"Карта нормалей","Normal strength":"Сила рельефа","Physical refraction":"Физическая рефракция","Refraction (IOR)":"Рефракция (IOR)","Transparency":"Прозрачность",
  "Characters":"Символы","Character Set":"Набор символов","Letters":"Буквы","Numbers":"Цифры","Letters + Numbers":"Буквы + цифры","Arrows & Chevrons":"Стрелки и шевроны","Math & Symbols":"Математика и символы","Custom Set":"Свой набор","Default ramp":"Стандартная шкала","Real-time character render":"Рендер символов в реальном времени",
  "Typography":"Типографика","Font weight":"Начертание","Letter spacing":"Межбуквенное расстояние","Line spacing":"Межстрочное расстояние","Appearance":"Внешний вид","Color":"Цвет","Solid":"Сплошной","Linear":"Линейный","Radial":"Радиальный","Angular":"Угловой","Second color":"Второй цвет","Gradient angle":"Угол градиента","Roughness":"Шероховатость","Color opacity":"Прозрачность цвета","Shader materials":"Шейдерные материалы","Procedural":"Процедурный","Satin":"Сатин","Pearl":"Перламутр","Lava":"Лава","Voronoi":"Вороной","Iridescent":"Переливы","Plasma":"Плазма","Contour":"Контуры","Hologram":"Голограмма","Effects":"Эффекты","Cartoon":"Мультфильм","Sketch":"Скетч","Halftone":"Растр","Pixelate":"Пикселизация","Chromatic":"Хроматический","Duotone":"Дуотон","Dither":"Дизеринг","Glow":"Свечение","Intensity":"Интенсивность","Blur":"Размытие","Thermal":"Тепловизор","Night Vision":"Ночное видение","Emboss":"Тиснение","First tone":"Первый тон","Second tone":"Второй тон","Affect background":"Обрабатывать фон","Post-processing is unavailable for ASCII":"Пост-обработка недоступна для ASCII","Lighting":"Освещение","Strength":"Яркость","Ambient":"Окружение","Shadow softness":"Мягкость тени","Shadow opacity":"Прозрачность тени","Depth":"Глубина","Soft shadow":"Мягкая тень","Background":"Фон","Scene":"Сцена","None":"Нет","Custom":"Пользовательский","Upload":"Загрузить","Noir":"Нуар","Sky":"Небо","Sunset":"Закат","Gallery":"Галерея","Acid":"Кислота",
  "Gloss":"Глянец","Metal":"Металл","Glass":"Стекло","Wood":"Дерево","Stone":"Камень","Marble":"Мрамор","Leather":"Кожа","Concrete":"Бетон","Rubber":"Резина","Clay":"Глина","Chrome":"Хром",
  "Ready to export":"Готово к экспорту","Transparent background":"Прозрачный фон","Background included":"Фон включён","High quality":"Высокое качество","Transparent":"Прозрачный","Studio black":"Чёрный фон","Scene background":"Фон сцены","Interactive":"Интерактивный","ASCII graphic":"ASCII-графика","3D geometry":"3D-геометрия",
  "Standard":"Стандарт","Diffuse":"Рассеянный","Top Left":"Сверху слева","Right":"Справа","Drag to position light":"Перетащите источник света","Playtools are available on desktop only.":"Playtools доступен только на десктопе.","INTERACTIVE EMBED":"ИНТЕРАКТИВНЫЙ EMBED","Put this shape anywhere.":"Разместите эту фигуру где угодно.","Copy the snippet and paste it into your site. The model keeps rotation, material and color settings.":"Скопируйте код и вставьте его на сайт. Модель сохранит вращение, материал и цвет.","Copy embed code":"Скопировать embed-код",
  "All parameters reset":"Все параметры сброшены","Background uploaded":"Фон загружен","Background removed":"Фон удалён","Copy parameters first":"Сначала скопируйте параметры","Could not cache the shape library":"Не удалось сохранить библиотеку фигур","Could not read this JPG":"Не удалось прочитать JPG","Could not read this font":"Не удалось прочитать шрифт","Embed code copied":"Embed-код скопирован","Enter some text first":"Сначала введите текст","File is larger than 12 MB":"Файл больше 12 МБ","Font is larger than 12 MB":"Шрифт больше 12 МБ","TTF and OTF files only":"Поддерживаются только TTF и OTF","Font added":"Шрифт добавлен","JPG materials only":"Поддерживаются только JPG-материалы","Material is larger than 8 MB":"Материал больше 8 МБ","Parameters copied":"Параметры скопированы","Parameters pasted":"Параметры вставлены","SVG and PNG files only":"Поддерживаются только SVG и PNG","Shape added to the library":"Фигура добавлена в библиотеку","Shape pasted from Figma":"Фигура вставлена из Figma","Clipboard does not contain SVG or PNG":"В буфере обмена нет SVG или PNG","Clipboard access denied":"Нет доступа к буферу обмена","Use Command or Control V to paste from Figma":"Используйте ⌘/Ctrl+V для вставки из Figma","Shape removed from the library":"Фигура удалена из библиотеки","Text shape added to the library":"Текстовая фигура добавлена в библиотеку","Transparent PNG exported":"Прозрачный PNG экспортирован","PNG with background exported":"PNG с фоном экспортирован","ASCII text exported":"ASCII-текст экспортирован","OBJ geometry exported":"OBJ-геометрия экспортирована"
};

const materials: BuiltInMaterial[] = [
  "Gloss", "Metal", "Glass", "Wood", "Stone", "Marble", "Leather",
  "Concrete", "Rubber", "Clay", "Chrome", "Fur", ...shaderPresets,
];

const initialPalette = ["#E0E0E0", "#FF5C35", "#6C5CE7", "#F4F1E9", "#2878FF"];
const textureMaterials: BuiltInMaterial[] = ["Wood","Stone","Marble","Leather","Concrete","Rubber"];
const backgrounds = ["Noir","Sky","Sunset","Gallery","Acid"];
const postEffects:{name:PostEffect;icon:typeof Cancel01Icon}[]=[{name:"None",icon:Cancel01Icon},{name:"ASCII",icon:TextIcon},{name:"Cartoon",icon:BubblesIcon},{name:"Sketch",icon:PencilIcon},{name:"Halftone",icon:CircleIcon},{name:"Pixelate",icon:GridIcon},{name:"Chromatic",icon:ColorsIcon},{name:"Duotone",icon:CircleIcon},{name:"Dither",icon:GridIcon},{name:"Thermal",icon:ColorsIcon}];
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

const demoModel:ShapeItem={id:"demo-cat",name:"Cat Base Mesh.obj",source:publicAsset("models/cat.obj"),demo:true,kind:"object"};
const demoShapeParams:ShapeParams={...defaultShapeParams,geometryMode:"Inflate",segments:1024,surfaceDetail:5,inflateAmount:50,material:"Fur",color:"#2878FF",colorMode:"Linear"};
const demoShape:ShapeItem={id:"demo-rzw",name:"rzw.svg",source:publicAsset("rzw.svg"),demo:true,kind:"image",params:demoShapeParams};
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
  const itemFiles=Array.from(data.items).filter(item=>item.kind==="file").map(item=>item.getAsFile()).filter((file):file is File=>Boolean(file));
  const available=[...files,...itemFiles];
  const vector=available.find(file=>file.type==="image/svg+xml"||/\.svg$/i.test(file.name));
  if(vector)return new File([vector],/\.svg$/i.test(vector.name)?vector.name:`figma-${Date.now()}.svg`,{type:"image/svg+xml"});
  const png=available.find(file=>file.type==="image/png"||/\.png$/i.test(file.name));
  return png?new File([png],/\.png$/i.test(png.name)?png.name:`figma-${Date.now()}.png`,{type:"image/png"}):null;
}

async function fileFromClipboardItems(items:ClipboardItem[]){
  for(const type of ["image/svg+xml","text/plain","text/html","image/png"]){
    for(const item of items){
      if(!item.types.includes(type))continue;
      try{
        const blob=await item.getType(type);
        if(type.startsWith("text/")){
          const svg=svgFileFromText(await blob.text());
          if(svg)return svg;
        }else return new File([blob],`figma-${Date.now()}.${type.endsWith("png")?"png":"svg"}`,{type});
      }catch{/* Try the next clipboard representation. */}
    }
  }
  return null;
}

function RangeControl({ label, value, min, max, step=1, suffix="", onChange }:{ label:string; value:number; min:number; max:number; step?:number; suffix?:string; onChange:(value:number)=>void }) {
  const update = (raw:number) => onChange(Math.max(min,Math.min(max,Number.isFinite(raw)?raw:min)));
  const progress=(value-min)/(max-min)*100;
  return <label className="range-control"><span>{label}<span className="number-wrap"><input aria-label={`${label} value`} type="number" min={min} max={max} step={step} value={value} onChange={(e)=>update(+e.target.value)} /><i>{suffix}</i></span></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} style={{background:`linear-gradient(90deg,#e0e0e0 0 ${progress}%,#292929 ${progress}% 100%)`}} onChange={(e)=>onChange(+e.target.value)} /></label>;
}

function OptionToggle({label,value,options,onChange,t}:{label:string;value:string;options:string[];onChange:(value:string)=>void;t:(value:string)=>string}){
  return <div className="option-control"><span>{label}</span><div role="group" aria-label={label}>{options.map(option=><button key={option} className={value===option?"active":""} onClick={()=>onChange(option)}>{t(option)}</button>)}</div></div>;
}

function ColorSwatch({color,selected,onChoose,onRemove}:{color:string;selected:boolean;onChoose:()=>void;onRemove:()=>void}){
  return <span className="palette-swatch"><button aria-label={`Set color ${color}`} className={selected?"selected":""} style={{background:color}} onClick={onChoose}/><button className="palette-delete" aria-label={`Remove color ${color}`} onPointerDown={(event)=>event.stopPropagation()} onMouseDown={(event)=>event.stopPropagation()} onClick={(event)=>{event.preventDefault();event.stopPropagation();onRemove();}}><HugeiconsIcon icon={Cancel01Icon} size={14} aria-hidden="true"/></button></span>;
}


function TonePalette({label,color,colors,onChange,onCommit,t,plain=false}:{label:string;color:string;colors:string[];onChange:(color:string)=>void;onCommit?:(color:string)=>void;t:(value:string)=>string;plain?:boolean}){
  const [hex,setHex]=useState(color);
  useEffect(()=>setHex(color),[color]);
  const commit=()=>{const value=hex.trim().toUpperCase();if(/^#[0-9A-F]{6}$/.test(value)){onChange(value);onCommit?.(value);}else setHex(color);};
  return <div className={`effect-color ${plain?"plain":""}`}><div className="control-row"><span>{t(label)}</span>{plain?<input className="color-hex-input" aria-label={`${label} HEX`} value={hex} maxLength={7} spellCheck={false} onChange={event=>setHex(event.target.value.toUpperCase())} onBlur={commit} onKeyDown={event=>{if(event.key==="Enter"){commit();event.currentTarget.blur();}}}/>:<output>{color}</output>}</div><div className="tone-palette">{colors.map(item=><button key={item} aria-label={`Set ${label.toLowerCase()} ${item}`} className={color===item?"active":""} style={{background:item}} onClick={()=>onChange(item)}/>)}<label className="custom-color"><HugeiconsIcon icon={AddIcon} size={14} aria-hidden="true"/><ColorSpectrum label={`Custom ${label.toLowerCase()}`} color={color} onInput={onChange} onCommit={onCommit}/></label></div></div>;
}

function BackgroundSwatch({item,selected,onChoose,onRemove}:{item:CustomBackground;selected:boolean;onChoose:()=>void;onRemove:()=>void}){
  return <span className="background-item"><button aria-label={`Use ${item.name}`} className={selected?"active":""} onClick={onChoose}><span style={{backgroundImage:`url(${item.source})`}}/><small>{item.name}</small></button><button className="background-delete" aria-label={`Remove ${item.name}`} onPointerDown={(event)=>event.stopPropagation()} onMouseDown={(event)=>event.stopPropagation()} onClick={(event)=>{event.preventDefault();event.stopPropagation();onRemove();}}><HugeiconsIcon icon={Cancel01Icon} size={14} aria-hidden="true"/></button></span>;
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

function EmbedViewer(){
  const [payload,setPayload]=useState<EmbedPayload|null>(null);
  const [error,setError]=useState("");
  const stageRef=useRef<StageHandle>(null);
  const rotationApplied=useRef(false);
  useEffect(()=>{let cancelled=false;decodeEmbedPayload(window.location.hash.slice(1)).then(value=>{if(!cancelled)setPayload(value);}).catch(()=>{if(!cancelled)setError("This embed link is invalid or incomplete.");});return()=>{cancelled=true;};},[]);
  const applyRotation=useCallback(()=>{if(!payload||rotationApplied.current)return;rotationApplied.current=true;if(payload.scene.camera){stageRef.current?.setCamera("zoom",payload.scene.camera.zoom);stageRef.current?.setCamera("focalLength",payload.scene.camera.focalLength);}(["x","y","z"] as const).forEach(axis=>stageRef.current?.setRotation(axis,payload.scene.rotation[axis]));},[payload]);
  if(error)return <main className="embed-shell embed-message"><img src={publicAsset("favicon.svg")} alt=""/><strong>Playtools</strong><p>{error}</p></main>;
  if(!payload)return <main className="embed-shell embed-message"><span className="embed-spinner"/><strong>Loading Playtools embed</strong></main>;
  const p=migrateAppearance(payload.params),s=payload.scene;
  const glyphs=p.asciiCharacterSet==="Custom Set"?p.asciiCustomSet:(asciiCharacterSets[p.asciiCharacterSet]??asciiCharacterSets["Letters + Numbers"]);
  return <main className="embed-shell">
    <ThreeStage ref={stageRef} source={payload.shape.source} fileName={payload.shape.fileName} text={payload.shape.text} fontUrl={payload.shape.fontUrl} fontWeight={p.fontWeight} letterSpacing={p.letterSpacing} lineSpacing={p.lineSpacing} geometryMode={p.geometryMode} thickness={p.thickness} material={p.material} furLength={p.furLength??35} furDensity={p.furDensity??120} customMaterialUrl={payload.customMaterialUrl} color={p.color} colorMode={p.colorMode??"Solid"} gradientColor={p.gradientColor??"#6C5CE7"} gradientAngle={p.gradientAngle??0} colorOpacity={p.colorOpacity} glassIor={p.glassIor} glassTransparency={p.glassTransparency} roughness={p.roughness} light={s.light} lightX={s.lightX} lightY={s.lightY} lightZ={s.lightZ} ambientLight={s.ambientLight} shadowSoftness={s.shadowSoftness} shadowOpacity={s.shadowOpacity} shadows={s.shadows} segments={p.segments} surfaceDetail={p.surfaceDetail} edge={p.edge} mass={p.mass} revolveAngle={p.revolveAngle??360} revolveEdge={p.revolveEdge??"Outer"} inflateAmount={p.inflateAmount} inflateDirection={p.inflateDirection??"Outward"} bend={p.bend} bulge={p.bulge} taper={p.taper} twist={p.twist} textureRepeat={p.textureRepeat} textureRotation={p.textureRotation} textureTint={p.textureTint} normalStrength={p.normalMapEnabled===false?0:p.normalStrength} asciiCharacters={p.asciiCharacters} asciiGlyphs={glyphs} effect={p.effect} effectIntensity={p.effectIntensity} effectBlur={p.effectBlur??4} effectBackground={p.effectBackground} duotoneDarkColor={p.duotoneDarkColor} duotoneColor={p.duotoneColor} background={s.background} backgroundFill={s.backgroundFill} onReady={applyRotation}/>
    <a className="embed-brand" href={new URL(import.meta.env.BASE_URL,window.location.origin).href} target="_blank" rel="noreferrer"><img src={publicAsset("favicon.svg")} alt=""/><span>Playtools</span></a>
    <div className="embed-hint">LMB rotate · RMB pan · Scroll zoom</div>
  </main>;
}

function Home() {
  const [language,setLanguage]=useState<Language>("en");
  const [shapeItems, setShapeItems] = useState<ShapeItem[]>([demoShape,demoModel]);
  const [customMaterials,setCustomMaterials]=useState<CustomMaterial[]>([]);
  const [activeShapeId, setActiveShapeId] = useState("demo-rzw");
  const [libraryReady, setLibraryReady] = useState(false);
  const [sourceMode, setSourceMode] = useState<"image"|"text"|"object">("image");
  const [textDraft, setTextDraft] = useState("SHAPE");
  const [fontDraft, setFontDraft] = useState(googleFonts[0].url);
  const [customFonts,setCustomFonts]=useState<FontOption[]>([]);
  const [geometryMode,setGeometryMode]=useState<GeometryMode>(demoShapeParams.geometryMode);
  const [thickness, setThickness] = useState(42);
  const [segments, setSegments] = useState(demoShapeParams.segments);
  const [surfaceDetail, setSurfaceDetail] = useState(demoShapeParams.surfaceDetail);
  const [edge, setEdge] = useState(24);
  const [mass, setMass] = useState(0);
  const [revolveAngle,setRevolveAngle]=useState(360);
  const [revolveEdge,setRevolveEdge]=useState<RevolveEdge>("Outer");
  const [inflateAmount,setInflateAmount]=useState(demoShapeParams.inflateAmount);
  const [inflateDirection,setInflateDirection]=useState<InflateDirection>("Outward");
  const [bend, setBend] = useState(0);
  const [bulge, setBulge] = useState(0);
  const [taper, setTaper] = useState(0);
  const [twist, setTwist] = useState(0);
  const [fontWeight,setFontWeight]=useState(400);
  const [letterSpacing,setLetterSpacing]=useState(0);
  const [lineSpacing,setLineSpacing]=useState(118);
  const [material, setMaterial] = useState<Material>(demoShapeParams.material);
  const [color, setColor] = useState(demoShapeParams.color);
  const [hexDraft, setHexDraft] = useState(demoShapeParams.color);
  const [paletteColors, setPaletteColors] = useState(initialPalette);
  const [colorOpacity, setColorOpacity] = useState(100);
  const [glassIor, setGlassIor] = useState(1.5);
  const [glassTransparency, setGlassTransparency] = useState(100);
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
  const [colorMode,setColorMode]=useState<ColorMode>(demoShapeParams.colorMode);
  const [gradientColor,setGradientColor]=useState("#6C5CE7");
  const [gradientAngle,setGradientAngle]=useState(0);
  const [furLength,setFurLength]=useState(35);
  const [furDensity,setFurDensity]=useState(120);
  const [normalStrength,setNormalStrength]=useState(135);
  const [normalMapEnabled,setNormalMapEnabled]=useState(true);
  const [asciiCharacters,setAsciiCharacters]=useState(128);
  const [asciiCharacterSet,setAsciiCharacterSet]=useState<AsciiCharacterSet>("Letters + Numbers");
  const [asciiCustomSet,setAsciiCustomSet]=useState(" .:-=+*#%@");
  const [effect,setEffect]=useState<PostEffect>("None");
  const [effectIntensity,setEffectIntensity]=useState(70);
  const [effectBlur,setEffectBlur]=useState(4);
  const [effectBackground,setEffectBackground]=useState(false);
  const [duotoneDarkColor,setDuotoneDarkColor]=useState("#090C13");
  const [duotoneColor,setDuotoneColor]=useState("#FF7A45");
  const [background, setBackground] = useState("None");
  const [backgroundFill,setBackgroundFill]=useState<BackgroundFill>({colorMode:"Solid",color:"#B9DBE5",gradientColor:"#E0E5E5",gradientAngle:0});
  const [customBackgrounds,setCustomBackgrounds]=useState<CustomBackground[]>([]);
  const [presets,setPresets]=useState<SavedPreset[]>(()=>{try{const saved=JSON.parse(localStorage.getItem("playtools-presets")??"[]");return Array.isArray(saved)?saved.map(item=>item?.params?{...item,params:{...defaultShapeParams,...item.params}}:item).filter(item=>item&&typeof item.id==="string"&&typeof item.name==="string"&&item.scene&&item.params&&Object.entries(defaultShapeParams).every(([key,value])=>typeof item.params[key]===typeof value&&(typeof value!=="number"||Number.isFinite(item.params[key])))):[];}catch{return [];}});
  const [savingPreset,setSavingPreset]=useState(false);
  const [newPresetId,setNewPresetId]=useState("");
  const newPresetInputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(newPresetId){newPresetInputRef.current?.focus();newPresetInputRef.current?.select();newPresetInputRef.current?.scrollIntoView({block:"nearest"});}},[newPresetId]);
  const [selectedPreset,setSelectedPreset]=useState("");
  const [captionColors,setCaptionColors]=useState({links:"black",hint:"black",logo:"white"});
  const [gravity,setGravity]=useState(false);
  const [cameraView, setCameraView] = useState({zoom:1,focalLength:54});
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
  const [triangles, setTriangles] = useState(0);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedCode,setEmbedCode]=useState("");
  const [embedBusy,setEmbedBusy]=useState(false);
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
  const nativePasteAtRef=useRef(0);
  const pasteFingerprintRef=useRef({value:"",at:0});

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
  const currentParams:ShapeParams={furLength,furDensity,geometryMode,thickness,segments,surfaceDetail,edge,mass,revolveAngle,revolveEdge,inflateAmount,inflateDirection,bend,bulge,taper,twist,fontWeight,letterSpacing,lineSpacing,material,color,colorMode,gradientColor,gradientAngle,colorOpacity,roughness,textureRepeat,textureRotation,textureTint,normalStrength,normalMapEnabled,glassIor,glassTransparency,asciiCharacters,asciiCharacterSet,asciiCustomSet,effect,effectIntensity,effectBlur,effectBackground,duotoneDarkColor,duotoneColor};
  const asciiGlyphs=asciiCharacterSet==="Custom Set"?asciiCustomSet:(asciiCharacterSets[asciiCharacterSet]??asciiCharacterSets["Letters + Numbers"]);
  const activeCustomMaterial=customMaterials.find(item=>material===`Custom:${item.id}`);
  const activeCustomBackground=customBackgrounds.find(item=>item.source===background);
  const fontOptions=[...googleFonts,...customFonts];
  const activeFont=fontOptions.find(item=>item.url===fontDraft)??googleFonts[0];
  const customMaterialUrl=activeCustomMaterial?.source;
  const isTexturedMaterial=textureMaterials.includes(material as BuiltInMaterial)||Boolean(activeCustomMaterial);
  const hasNormalMap=textureMaterials.includes(material as BuiltInMaterial);
  useEffect(()=>setSelectedPreset(""),[activeShapeId]);
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
      const items=[demoShape,demoModel,...restored];
      const target=items.find(item=>item.id===(saved?.activeShapeId==="demo-teapot"?demoModel.id:saved?.activeShapeId))??items[0];
      setShapeItems(items);setCustomFonts(restoredFonts);setCustomMaterials(restoredMaterials);setActiveShapeId(target.id);setSourceMode(target.kind??"image");
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

  const importFile = useCallback(async (file?: File,successMessage="Shape added to the library") => {
    if (!file) return;
    if (!/\.(svg|png|obj|stl)$/i.test(file.name)) {
      flash("SVG, PNG, OBJ and STL files only");
      return;
    }
    if(file.size>12*1024*1024){flash("File is larger than 12 MB");return;}
    if(/\.(obj|stl)$/i.test(file.name)) {
      try { const geometry=parseModel(await file.arrayBuffer(),file.name);geometry.dispose(); }
      catch(error){flash(error instanceof Error?error.message:"Could not load model");return;}
    }
    const params={...defaultShapeParams};
    const item:ShapeItem={id:`shape-${Date.now()}-${Math.random().toString(36).slice(2)}`,name:file.name,source:URL.createObjectURL(file),blob:file,params,kind:/\.(obj|stl)$/i.test(file.name)?"object":"image"};
    setShapeItems(items=>[...items,item]);
    setActiveShapeId(item.id);
    setSourceMode(item.kind??"image");
    applyParams(params);
    resetHistory(params);
    flash(successMessage);
  },[flash]);

  useEffect(()=>{
    const importPastedFile=(file:File)=>{
      const now=Date.now(),fingerprint=`${file.type}:${file.size}`;
      if(pasteFingerprintRef.current.value===fingerprint&&now-pasteFingerprintRef.current.at<900)return;
      pasteFingerprintRef.current={value:fingerprint,at:now};
      importFile(file,"Shape pasted from Figma");
    };
    const handlePaste=(event:ClipboardEvent)=>{
      if(!event.clipboardData)return;
      const file=fileFromPasteData(event.clipboardData);
      if(!file)return;
      nativePasteAtRef.current=Date.now();
      event.preventDefault();
      importPastedFile(file);
    };
    const handleKeyDown=(event:KeyboardEvent)=>{
      if(event.code==="KeyG"&&!event.repeat&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!(event.target instanceof Element&&event.target.closest("input,textarea,select,[contenteditable]"))){event.preventDefault();setGravity(value=>!value);return;}
      if(event.key.toLowerCase()!=="v"||(!event.metaKey&&!event.ctrlKey)||!navigator.clipboard?.read)return;
      const started=Date.now();
      const fallback=navigator.clipboard.read().then(fileFromClipboardItems).catch(()=>null);
      window.setTimeout(()=>{
        if(nativePasteAtRef.current>=started)return;
        fallback.then(file=>{if(file)importPastedFile(file);});
      },80);
    };
    document.addEventListener("paste",handlePaste,true);
    document.addEventListener("keydown",handleKeyDown,true);
    return()=>{document.removeEventListener("paste",handlePaste,true);document.removeEventListener("keydown",handleKeyDown,true);};
  },[importFile]);

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

  function applyParams(params:ShapeParams,suppress=true){params=migrateAppearance(params);if(suppress)suppressHistoryRef.current=true;setGeometryMode(params.geometryMode??"Extrude");setThickness(params.thickness);setSegments(params.segments);setSurfaceDetail(params.surfaceDetail??3);setEdge(params.edge);setMass(params.mass);setRevolveAngle(params.revolveAngle??360);setRevolveEdge(params.revolveEdge??"Outer");setInflateAmount(params.inflateAmount??55);setInflateDirection(params.inflateDirection??"Outward");setBend(params.bend);setBulge(params.bulge);setTaper(params.taper);setTwist(params.twist);setFontWeight(params.fontWeight??400);setLetterSpacing(params.letterSpacing??0);setLineSpacing(params.lineSpacing??118);setMaterial(params.material);setFurLength(params.furLength??35);setFurDensity(params.furDensity??120);setColor(params.color);setColorMode(params.colorMode??"Solid");setGradientColor(params.gradientColor??"#6C5CE7");setGradientAngle(params.gradientAngle??0);setHexDraft(params.color);setColorOpacity(params.colorOpacity);setRoughness(params.roughness);setTextureRepeat(params.textureRepeat);setTextureRotation(params.textureRotation);setTextureTint(params.textureTint);setNormalStrength(params.normalStrength??135);setNormalMapEnabled(params.normalMapEnabled??true);setGlassIor(params.glassIor);setGlassTransparency(params.glassTransparency);setAsciiCharacters(params.asciiCharacters??128);setAsciiCharacterSet(params.asciiCharacterSet??"Letters + Numbers");setAsciiCustomSet(params.asciiCustomSet??" .:-=+*#%@");setEffect(params.effect??"None");setEffectIntensity(params.effectIntensity??70);setEffectBlur(params.effectBlur??4);setEffectBackground(params.effectBackground??false);setDuotoneDarkColor(params.duotoneDarkColor??"#090C13");setDuotoneColor(params.duotoneColor??"#FF7A45");}
  function resetHistory(params:ShapeParams){historyRef.current=[{...params}];historyIndexRef.current=0;setHistoryTick(tick=>tick+1);}
  const selectShape=(id:string)=>{const target=shapeItems.find(item=>item.id===id);if(!target||id===activeShapeId)return;const params=target.params??{...defaultShapeParams};setActiveShapeId(id);setSourceMode(target.kind??"image");if(target.kind==="text"){setTextDraft(target.text??"");setFontDraft(target.fontUrl??googleFonts[0].url);}applyParams(params);resetHistory(params);};
  const deleteShape=(id:string)=>{
    const index=shapeItems.findIndex(item=>item.id===id),target=shapeItems[index];
    if(index<0||target.demo)return;
    if(target.source?.startsWith("blob:"))URL.revokeObjectURL(target.source);
    const remaining=shapeItems.filter(item=>item.id!==id);
    setShapeItems(remaining);
    if(id===activeShapeId){
      const next=remaining[Math.min(index,remaining.length-1)]??demoShape;
      const params=next.params??{...defaultShapeParams};
      setActiveShapeId(next.id);setSourceMode(next.kind??"image");
      if(next.kind==="text"){setTextDraft(next.text??"");setFontDraft(next.fontUrl??googleFonts[0].url);}
      applyParams(params);resetHistory(params);
    }
    flash("Shape removed from the library");
  };
  const copyParams=()=>{clipboardRef.current={...currentParams};flash("Parameters copied");};
  const pasteParams=()=>{if(!clipboardRef.current){flash("Copy parameters first");return;}applyParams(clipboardRef.current,false);flash("Parameters pasted");};
  const undo=()=>{if(historyIndexRef.current<=0)return;historyIndexRef.current--;applyParams(historyRef.current[historyIndexRef.current]);setHistoryTick(tick=>tick+1);};
  const redo=()=>{if(historyIndexRef.current>=historyRef.current.length-1)return;historyIndexRef.current++;applyParams(historyRef.current[historyIndexRef.current]);setHistoryTick(tick=>tick+1);};

  const resetGeometry = () => { setGeometryMode("Extrude");setThickness(42); setSegments(18); setSurfaceDetail(3); setEdge(24); setMass(0);setRevolveAngle(360);setRevolveEdge("Outer");setInflateAmount(55);setInflateDirection("Outward"); };
  const resetDeform = () => { setBend(0); setBulge(0); setTaper(0); setTwist(0); };
  const resetMaterial = () => { setMaterial("Gloss");setFurLength(35);setFurDensity(120); setTextureRepeat(2); setTextureRotation(0); setTextureTint(0); setNormalStrength(135); setNormalMapEnabled(true); setGlassIor(1.5); setGlassTransparency(100); };
  const resetAppearance = () => { setColorMode("Solid");setGradientColor("#6C5CE7");setGradientAngle(0); setColor("#E0E0E0"); setHexDraft("#E0E0E0"); setColorOpacity(100); setRoughness(18); };
  const resetTypography=()=>{setFontWeight(400);setLetterSpacing(0);setLineSpacing(118);};
  const resetEffects = () => { setEffect("None");setAsciiCharacters(128);setAsciiCharacterSet("Letters + Numbers");setAsciiCustomSet(" .:-=+*#%@");setEffectIntensity(70);setEffectBlur(4);setEffectBackground(false);setDuotoneDarkColor("#090C13");setDuotoneColor("#FF7A45"); };
  const resetLighting = () => { setLight(72); setLightX(-3); setLightY(5); setLightZ(5); setAmbientLight(55); setShadowSoftness(72); setShadowOpacity(18); setShadows(true); };
  const resetBackground = () => setBackground("None");
  const savePreset=async()=>{
    if(savingPreset)return;setSavingPreset(true);
    const name=nextPresetName(presets.map(preset=>preset.name));
    try{
      const savedBackground=activeCustomBackground?await blobToDataUrl(activeCustomBackground.blob):background;
      const preset:SavedPreset={id:crypto.randomUUID(),name,params:{...currentParams},scene:{light,lightX,lightY,lightZ,ambientLight,shadowSoftness,shadowOpacity,shadows,gravity,background:savedBackground,backgroundFill:{...backgroundFill},camera:{...cameraView},rotation:{...rotation}}};
      const next=[...presets,preset];localStorage.setItem("playtools-presets",JSON.stringify(next));setPresets(next);setSelectedPreset(preset.id);setNewPresetId(preset.id);
      flash(language==="ru"?"Пресет сохранён":"Preset saved");
    }catch{flash(language==="ru"?"Не удалось сохранить пресет: недостаточно места":"Could not save preset: storage is full");}
    finally{setSavingPreset(false);}
  };
  const deletePreset=(id:string)=>{
    try{const next=presets.filter(item=>item.id!==id);localStorage.setItem("playtools-presets",JSON.stringify(next));setPresets(next);setSelectedPreset("");}
    catch{flash(language==="ru"?"Не удалось удалить пресет":"Could not delete preset");}
  };
  const renamePreset=(id:string,name:string)=>{
    try{const next=presets.map(preset=>preset.id===id?{...preset,name}:preset);localStorage.setItem("playtools-presets",JSON.stringify(next));setPresets(next);}
    catch{flash(language==="ru"?"Не удалось сохранить название":"Could not save preset name");}
  };
  const applyPreset=(id:string)=>{
    const preset=presets.find(item=>item.id===id);if(!preset)return;
    applyParams(preset.params);resetHistory(preset.params);
    const s=preset.scene;setLight(s.light);setLightX(s.lightX);setLightY(s.lightY);setLightZ(s.lightZ);setAmbientLight(s.ambientLight);setShadowSoftness(s.shadowSoftness);setShadowOpacity(s.shadowOpacity);setShadows(s.shadows);setBackground(s.background);if(s.backgroundFill)setBackgroundFill(s.backgroundFill);setGravity(s.gravity??false);
    stageRef.current?.reset();if(s.camera){stageRef.current?.setCamera("zoom",s.camera.zoom);stageRef.current?.setCamera("focalLength",s.camera.focalLength);}(["x","y","z"] as const).forEach(axis=>stageRef.current?.setRotation(axis,s.rotation[axis]));setSelectedPreset(id);
    flash(language==="ru"?"Пресет применён":"Preset applied");
  };
  const resetAll = () => { setGravity(false); resetGeometry(); resetDeform();resetTypography(); resetMaterial(); resetAppearance();resetEffects(); resetLighting(); resetBackground(); resetView(); flash("All parameters reset"); };
  const rememberColor = (next:string) => setPaletteColors(items=>items.includes(next)?items:[...items,next]);
  const chooseColor = (next:string, add=true) => { const normalized=next.toUpperCase(); setColor(normalized); setHexDraft(normalized); if(add)setPaletteColors(items=>items.includes(normalized)?items:[...items,normalized]); };
  const commitHex = () => { const value=hexDraft.trim(); if(/^#[0-9A-F]{6}$/i.test(value))chooseColor(value,true); else setHexDraft(color.toUpperCase()); };

  useEffect(()=>{
    let cancelled=false;const canvas=document.createElement("canvas");canvas.width=canvas.height=256;const ctx=canvas.getContext("2d");if(!ctx)return;
    const update=()=>{
      if(cancelled)return;
      const colorFor=(selector:string,alpha=captionOpacity)=>{
        const element=document.querySelector(selector);if(!element)return "black";
        const rect=element.getBoundingClientRect(),samples:RGB[]=[];
        for(const y of [.15,.5,.85])for(const x of [.1,.3,.5,.7,.9]){
          const px=Math.max(0,Math.min(255,Math.floor((rect.left+rect.width*x)/window.innerWidth*256))),py=Math.max(0,Math.min(255,Math.floor((rect.top+rect.height*y)/window.innerHeight*256)));
          const pixel=ctx.getImageData(px,py,1,1).data;samples.push([pixel[0],pixel[1],pixel[2]]);
        }
        return captionInk(samples,alpha);
      };
      try{setCaptionColors({links:colorFor(".project-links"),hint:colorFor(".drag-hint"),logo:colorFor(".studio-brand",1)});}catch{setCaptionColors({links:"white",hint:"white",logo:"white"});}
    };
    if(background.startsWith("blob:")||background.startsWith("data:image/")){
      const image=new Image();image.onload=()=>{if(cancelled)return;ctx.fillStyle="#080808";ctx.fillRect(0,0,256,256);ctx.drawImage(image,0,0,256,256);update();};image.onerror=()=>{ctx.fillStyle="#080808";ctx.fillRect(0,0,256,256);update();};image.src=background;
    }else{
      const colors=backgroundPresets[background];paintBackgroundFill(ctx,background==="Fill"?backgroundFill:{colorMode:colors?"Linear":"Solid",color:colors?.[0]??"#080808",gradientColor:colors?.[1]??"#080808",gradientAngle:315});update();
    }
    window.addEventListener("resize",update);return()=>{cancelled=true;window.removeEventListener("resize",update);};
  },[background,backgroundFill,language,interfaceHidden,gravity]);

  const prepareEmbed=async()=>{
    if(!activeShape||embedBusy)return;
    setEmbedBusy(true);
    try{
      const shapeSource=activeShape.kind==="text"?null:activeShape.blob?await blobToDataUrl(activeShape.blob):activeShape.source;
      const fontUrl=activeShape.kind==="text"?(activeShape.fontBlob?await blobToDataUrl(activeShape.fontBlob):activeShape.fontUrl):undefined;
      const customMaterialUrl=activeCustomMaterial?await blobToDataUrl(activeCustomMaterial.blob):undefined;
      const embedBackground=activeCustomBackground?await blobToDataUrl(activeCustomBackground.blob):background;
      const payload:EmbedPayload={version:1,shape:{fileName,source:shapeSource,text:activeShape.kind==="text"?activeShape.text:undefined,fontUrl},params:{...currentParams},scene:{light,lightX,lightY,lightZ,ambientLight,shadowSoftness,shadowOpacity,shadows,background:embedBackground,backgroundFill:background==="Fill"?backgroundFill:undefined,camera:cameraView,rotation:{...rotation}},customMaterialUrl};
      const encoded=await encodeEmbedPayload(payload);
      const url=new URL(import.meta.env.BASE_URL,window.location.origin);url.searchParams.set("embed","1");url.hash=encoded;
      setEmbedCode(`<iframe src="${url.href}" width="640" height="640" title="Playtools 3D model" style="border:0" loading="lazy" allow="fullscreen"></iframe>`);
      setEmbedOpen(true);
    }catch{flash("Could not create embed");}
    finally{setEmbedBusy(false);}
  };

  return (
    <main data-background={background} style={{"--caption-opacity":captionOpacity} as React.CSSProperties} className={`studio-shell ${interfaceHidden?"interface-hidden":""}`}>
      <a data-ink={captionColors.logo} className="studio-brand brand" href={import.meta.env.BASE_URL}><img src={publicAsset("playtools-logo.svg")} alt="Playtools"/></a>
      <section className="workspace">
        <aside className="panel import-panel">
          <div className="panel-heading"><h2>{t("Source")}</h2></div>
          <div className="source-tabs"><button className={sourceMode==="image"?"active":""} title={t("Image")} aria-label={t("Image")} aria-pressed={sourceMode==="image"} onClick={()=>setSourceMode("image")}><HugeiconsIcon icon={Image01Icon} size={18} aria-hidden="true"/></button><button className={sourceMode==="text"?"active":""} title={t("Text")} aria-label={t("Text")} aria-pressed={sourceMode==="text"} onClick={()=>setSourceMode("text")}><HugeiconsIcon icon={TextIcon} size={18} aria-hidden="true"/></button><button className={sourceMode==="object"?"active":""} title={language==="ru"?"Объект":"Object"} aria-label={language==="ru"?"Объект":"Object"} aria-pressed={sourceMode==="object"} onClick={()=>setSourceMode("object")}><HugeiconsIcon icon={CubeIcon} size={18} aria-hidden="true"/></button></div>
          {sourceMode!=="text"?<button className="dropzone" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); importFile(e.dataTransfer.files[0]); }}>
            <span className="upload-icon"><HugeiconsIcon icon={ArrowUpRight01Icon} size={14} aria-hidden="true"/></span><strong>{sourceMode==="object"?(language==="ru"?"Загрузите модель":"Drop your model"):t("Drop your shape")}</strong><small>{sourceMode==="object"?"OBJ or STL":"SVG or PNG"} · max 12 MB</small>{sourceMode!=="object"&&<small className="figma-hint">{t("Figma: Copy as SVG or PNG, then paste")}</small>}
          </button>:<div className="text-source"><label><textarea aria-label={t("Text")} maxLength={120} rows={2} value={textDraft} style={{fontFamily:activeFont.family}} onChange={event=>setTextDraft(event.target.value)} onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key==="Enter")createTextShape();}}/></label><label><select aria-label={t("Font")} value={fontDraft} onChange={event=>setFontDraft(event.target.value)}><optgroup label={t("Google Fonts")}>{googleFonts.map(font=><option key={font.id} value={font.url}>{font.name}</option>)}</optgroup>{customFonts.length>0&&<optgroup label={t("Custom Fonts")}>{customFonts.map(font=><option key={font.id} value={font.url}>{font.name}</option>)}</optgroup>}</select></label><button className="font-upload" onClick={()=>fontRef.current?.click()}><span><HugeiconsIcon icon={AddIcon} size={14} aria-hidden="true"/> {t("Upload font")}</span></button><button className="create-text" onClick={createTextShape}><HugeiconsIcon icon={ArrowUpRight01Icon} size={14} aria-hidden="true"/> {t("Create")}</button></div>}
          <input ref={fileRef} className="file-input" type="file" accept={sourceMode==="object"?".obj,.stl":".svg,.png,image/svg+xml,image/png"} onChange={(e) => importFile(e.target.files?.[0])} />
          <input ref={fontRef} className="file-input" type="file" accept=".ttf,.otf,font/ttf,font/otf,application/x-font-ttf,application/x-font-opentype" onChange={event=>{void importFont(event.target.files?.[0]);event.currentTarget.value="";}} />
          <div className="shape-library" aria-label="Shape library">{shapeItems.filter(item=>(item.kind??"image")===sourceMode).map(item=><div key={item.id} className="source-card-wrap"><button className={`source-card ${item.id===activeShapeId?"active":""}`} onClick={()=>selectShape(item.id)}><div className={`source-thumb ${item.kind==="text"?"text-thumb":""}`} style={item.kind==="text"?{fontFamily:item.fontFamily}:undefined}>{item.kind==="object"?<HugeiconsIcon icon={CubeIcon} size={24} aria-hidden="true"/>:item.kind!=="text"&&item.source?<img src={item.source} alt=""/>:item.kind==="text"?<span>{item.text?.slice(0,2)}</span>:<span>{item.name.split(".").pop()?.toUpperCase()}</span>}</div><div><strong title={item.name}>{item.name}</strong></div><span className="ready-dot" title={item.id===activeShapeId?"active":"ready"}/></button>{!item.demo&&<button className="delete-shape" aria-label={`Delete ${item.name}`} title="Delete shape" onClick={()=>deleteShape(item.id)}><HugeiconsIcon icon={Cancel01Icon} size={14} aria-hidden="true"/></button>}</div>)}</div>
          <div className="tip"><HugeiconsIcon icon={InformationCircleIcon} size={14} aria-hidden="true"/><p>{t(sourceMode==="text"?"Text becomes real editable 3D outlines, including counters inside letters.":"Transparent shapes with clean edges give the best extrusion.")}</p></div>

        </aside>
          <div className="project-links" data-ink={captionColors.links}>
            <a className="support-project" href="https://pay.cloudtips.ru/p/55cf592d" target="_blank" rel="noreferrer"><HugeiconsIcon icon={HeartIcon} size={14} aria-hidden="true"/><strong>{t("Support the project")}</strong></a>
            <a className="author-badge" href="https://razuvaev.me" target="_blank" rel="noreferrer"><img src={publicAsset("rzw.svg")} alt=""/><strong>Alexey Razuvaev</strong></a>
          </div>

        <section className="stage" aria-label="3D preview">
          <div className="stage-top">
            <div><span>WEBGL LIVE</span><b>{triangles.toLocaleString(language==="ru"?"ru-RU":"en-US")} {t("TRIANGLES")}</b></div>
            <div className="stage-tools"><div className="language-toggle" aria-label="Language"><button className={language==="en"?"active":""} onClick={()=>setLanguage("en")}>EN</button><button className={language==="ru"?"active":""} onClick={()=>setLanguage("ru")}>RU</button></div><div className="stage-actions"><button title={t("Undo")} aria-label={t("Undo")} onClick={undo} disabled={historyIndexRef.current<=0}><HugeiconsIcon icon={UndoIcon} size={18} aria-hidden="true"/></button><button title={t("Redo")} aria-label={t("Redo")} onClick={redo} disabled={historyIndexRef.current>=historyRef.current.length-1}><HugeiconsIcon icon={RedoIcon} size={18} aria-hidden="true"/></button><button onClick={()=>stageRef.current?.center()} title={t("Center object")} aria-label={t("Center object")}><HugeiconsIcon icon={Target01Icon} size={18} aria-hidden="true"/></button><button onClick={resetView} title={t("Reset view")} aria-label={t("Reset view")}><HugeiconsIcon icon={RefreshIcon} size={18} aria-hidden="true"/></button><button title={t("Hide UI")} aria-label={t("Hide UI")} onClick={()=>setInterfaceHidden(true)}><HugeiconsIcon icon={ViewOffIcon} size={18} aria-hidden="true"/></button></div></div>
          </div>
          <div className="scene">
            <div className="ambient" style={{ opacity: light / 100 }} />
            <ThreeStage ref={stageRef} source={source} fileName={fileName} text={activeShape?.kind==="text"?activeShape.text:undefined} fontUrl={activeShape?.kind==="text"?activeShape.fontUrl:undefined} fontWeight={fontWeight} letterSpacing={letterSpacing} lineSpacing={lineSpacing} geometryMode={geometryMode} thickness={thickness} material={material} furLength={furLength} furDensity={furDensity} customMaterialUrl={customMaterialUrl} color={color} colorMode={colorMode} gradientColor={gradientColor} gradientAngle={gradientAngle} colorOpacity={colorOpacity} glassIor={glassIor} glassTransparency={glassTransparency} roughness={roughness} light={light} lightX={lightX} lightY={lightY} lightZ={lightZ} ambientLight={ambientLight} shadowSoftness={shadowSoftness} shadowOpacity={shadowOpacity} shadows={shadows} segments={segments} surfaceDetail={surfaceDetail} edge={edge} mass={mass} revolveAngle={revolveAngle} revolveEdge={revolveEdge} inflateAmount={inflateAmount} inflateDirection={inflateDirection} bend={bend} bulge={bulge} taper={taper} twist={twist} textureRepeat={textureRepeat} textureRotation={textureRotation} textureTint={textureTint} normalStrength={normalMapEnabled?normalStrength:0} asciiCharacters={asciiCharacters} asciiGlyphs={asciiGlyphs} effect={effect} effectIntensity={effectIntensity} effectBlur={effectBlur} effectBackground={effectBackground} duotoneDarkColor={duotoneDarkColor} duotoneColor={duotoneColor} background={background} backgroundFill={background==="Fill"?backgroundFill:undefined} gravity={gravity} demoSpin={Boolean(activeShape?.demo&&activeShape.kind!=="object")} onCameraChange={setCameraView} onRotationChange={setRotation} onReady={setTriangles} onLoading={setIsRendering} onError={flash} />
            {isRendering&&<div className="model-loader" role="status"><span/><b>{t("Building geometry")}</b><small>{t("Interface stays responsive")}</small></div>}
          </div>
          <div className="axis-row">
            {(["x", "y", "z"] as const).map(axis=><div key={axis} className="axis-control" onPointerDown={event=>startAxisDrag(axis,event)} onPointerMove={moveAxisDrag} onPointerUp={endAxisDrag} onPointerCancel={endAxisDrag}><span>{axis.toUpperCase()}</span><input aria-label={`${axis.toUpperCase()} rotation`} type="number" min={-360} max={360} step={1} value={Math.round(rotation[axis]*10)/10} onChange={event=>updateAxis(axis,+event.target.value)}/><i>°</i></div>)}
            <label className="axis-control camera-control"><span>{language==="ru"?"Зум":"Zoom"}</span><input aria-label="Zoom" type="number" min={0.23} max={7.7} step={0.01} value={cameraView.zoom} onChange={event=>stageRef.current?.setCamera("zoom",event.target.valueAsNumber)}/><i>×</i></label>
            <label className="axis-control camera-control" title={language==="ru"?"Перспектива: размер объекта в кадре сохраняется":"Perspective: keeps the object framing steady"}><span>{language==="ru"?"Объектив":"Lens"}</span><input aria-label="Focal length" type="number" min={10} max={200} step={1} value={cameraView.focalLength} onChange={event=>stageRef.current?.setCamera("focalLength",event.target.valueAsNumber)}/><i>mm</i></label>
            <p className="drag-hint" data-ink={captionColors.hint}>{gravity?(language==="ru"?"ЛКМ — тянуть · ПКМ — перемещение · Колесо — масштаб · G — стоп":"LMB drag · RMB pan · Scroll zoom · G freeze"):`${t("LMB rotate · RMB pan · Scroll zoom")} · ${language==="ru"?"G — гравитация":"G gravity"}`}</p>
            <button className="view-reset" onClick={resetView} aria-label={t("Reset view")}><HugeiconsIcon icon={RefreshIcon} size={18} aria-hidden="true"/></button>
          </div>
        </section>

        <aside className="panel properties-panel">
          <div className="panel-heading properties-heading"><h2>{t("Properties")}</h2></div>
          <div className="preset-controls">
            <div className="preset-actions">
              <button onClick={copyParams} title={t("Copy Properties")} aria-label={t("Copy Properties")}><HugeiconsIcon icon={Copy01Icon} size={16} aria-hidden="true"/></button>
              <button onClick={pasteParams} title={t("Paste Properties")} aria-label={t("Paste Properties")}><HugeiconsIcon icon={ClipboardPasteIcon} size={16} aria-hidden="true"/></button>
              <button onClick={()=>void savePreset()} disabled={savingPreset} title={language==="ru"?"Сохранить пресет":"Save preset"} aria-label={language==="ru"?"Сохранить пресет":"Save preset"}><HugeiconsIcon icon={FloppyDiskIcon} size={16} aria-hidden="true"/></button>
              <button onClick={resetAll} title={t("Reset all")} aria-label={t("Reset all")}><HugeiconsIcon icon={RefreshIcon} size={16} aria-hidden="true"/></button>
            </div>
            <div className="preset-list">{presets.map(preset=><div key={preset.id} className={`preset-row ${selectedPreset===preset.id?"active":""}`}>

              <input ref={preset.id===newPresetId?newPresetInputRef:undefined} aria-label={language==="ru"?`Название пресета ${preset.name}`:`Preset name ${preset.name}`} value={preset.name} maxLength={60} onChange={event=>renamePreset(preset.id,event.target.value)} onBlur={event=>{const name=event.target.value.trim()||nextPresetName(presets.map(item=>item.name));if(name!==preset.name)renamePreset(preset.id,name);}} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}}/>
              <button onClick={()=>applyPreset(preset.id)} title={language==="ru"?`Применить ${preset.name}`:`Apply ${preset.name}`} aria-label={language==="ru"?`Применить ${preset.name}`:`Apply ${preset.name}`}><HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} aria-hidden="true"/></button>
              <button onClick={()=>deletePreset(preset.id)} title={language==="ru"?"Удалить пресет":"Delete preset"} aria-label={language==="ru"?`Удалить ${preset.name}`:`Delete ${preset.name}`}><HugeiconsIcon icon={Cancel01Icon} size={14} aria-hidden="true"/></button>
            </div>)}</div>
          </div>

          {activeShape?.kind!=="object"&&<details className="property-section geometry-section" open>
            <summary><HugeiconsIcon className="section-expand" icon={AddIcon} size={12} aria-hidden="true"/><HugeiconsIcon className="section-collapse" icon={Remove01Icon} size={12} aria-hidden="true"/><span>{t("Geometry")}</span><button onClick={(e)=>{e.preventDefault();resetGeometry();}} aria-label="Reset geometry"><HugeiconsIcon icon={RefreshIcon} size={14} aria-hidden="true"/></button></summary>
            <div className="section-body stack-controls">
              <div className="geometry-modes" role="group" aria-label="Geometry operation">{(["Extrude","Revolve","Inflate"] as GeometryMode[]).map(mode=><button key={mode} className={geometryMode===mode?"active":""} onClick={()=>setGeometryMode(mode)}><HugeiconsIcon icon={mode==="Extrude"?CubeIcon:mode==="Revolve"?Rotate360Icon:BubblesIcon} size={24} aria-hidden="true"/><span>{t(mode)}</span></button>)}</div>
              {geometryMode==="Extrude"&&<RangeControl label={t("Thickness")} value={thickness} min={1} max={300} suffix={language==="ru"?"мм":"mm"} onChange={setThickness}/>}
              {geometryMode==="Revolve"&&<><RangeControl label={t("Angle")} value={revolveAngle} min={0} max={360} suffix="°" onChange={setRevolveAngle}/><OptionToggle label={t("Axis edge")} value={revolveEdge} options={["Outer","Inner"]} onChange={value=>setRevolveEdge(value as RevolveEdge)} t={t}/></>}
              <RangeControl label={t("Segments")} value={segments} min={3} max={1024} onChange={setSegments}/>
              <RangeControl label={t("Surface detail")} value={surfaceDetail} min={1} max={5} onChange={setSurfaceDetail}/>
              {geometryMode==="Extrude"&&<RangeControl label={t("Edge")} value={edge} min={0} max={300} suffix="%" onChange={setEdge}/>}
              {geometryMode==="Extrude"&&<RangeControl label={t("Mass")} value={mass} min={0} max={250} suffix="%" onChange={setMass}/>}
              {geometryMode==="Inflate"&&<><RangeControl label={t("Inflation")} value={inflateAmount} min={0} max={200} suffix="%" onChange={setInflateAmount}/><OptionToggle label={t("Direction")} value={inflateDirection} options={["Outward","Inward"]} onChange={value=>setInflateDirection(value as InflateDirection)} t={t}/></>}
            </div>
          </details>}

          {activeShape?.kind==="text"&&<details className="property-section typography-section" open>
            <summary><HugeiconsIcon className="section-expand" icon={AddIcon} size={12} aria-hidden="true"/><HugeiconsIcon className="section-collapse" icon={Remove01Icon} size={12} aria-hidden="true"/><span>{t("Typography")}</span><button onClick={(e)=>{e.preventDefault();resetTypography();}} aria-label="Reset typography"><HugeiconsIcon icon={RefreshIcon} size={14} aria-hidden="true"/></button></summary>
            <div className="section-body stack-controls">
              <RangeControl label={t("Font weight")} value={fontWeight} min={100} max={900} step={100} onChange={setFontWeight}/>
              <RangeControl label={t("Letter spacing")} value={letterSpacing} min={-25} max={100} suffix="%" onChange={setLetterSpacing}/>
              {(activeShape.text??"").includes("\n")&&<RangeControl label={t("Line spacing")} value={lineSpacing} min={60} max={250} suffix="%" onChange={setLineSpacing}/>}
            </div>
          </details>}

          <details className="property-section effects-section" open>
            <summary><HugeiconsIcon className="section-expand" icon={AddIcon} size={12} aria-hidden="true"/><HugeiconsIcon className="section-collapse" icon={Remove01Icon} size={12} aria-hidden="true"/><span>{t("Effects")}</span><button onClick={(e)=>{e.preventDefault();resetEffects();}} aria-label="Reset effects"><HugeiconsIcon icon={RefreshIcon} size={14} aria-hidden="true"/></button></summary>
            <div className="section-body effects-body">

              <div className="effects-grid" role="group" aria-label="Post-processing effect">{postEffects.map(item=><button key={item.name} className={effect===item.name?"active":""} onClick={()=>setEffect(item.name)}><HugeiconsIcon icon={item.icon} size={14} aria-hidden="true"/><span>{t(item.name)}</span></button>)}</div>
              {effect==="ASCII"&&<div className="texture-controls ascii-controls">
                <div className="texture-credit"><span>ASCII</span> {t("Real-time character render")}</div>
                <RangeControl label={t("Characters")} value={asciiCharacters} min={40} max={220} onChange={setAsciiCharacters}/>
                <label className="ascii-set-control"><span>{t("Character Set")}</span><select aria-label="ASCII character set" value={asciiCharacterSet} onChange={event=>setAsciiCharacterSet(event.target.value as AsciiCharacterSet)}>{(["Letters","Numbers","Letters + Numbers","Arrows & Chevrons","Math & Symbols","Custom Set"] as AsciiCharacterSet[]).map(option=><option key={option} value={option}>{t(option)}</option>)}</select></label>
                {asciiCharacterSet==="Custom Set"&&<label className="ascii-set-control"><span>{t("Custom Set")}</span><input aria-label="Custom ASCII characters" value={asciiCustomSet} maxLength={96} placeholder=" .:-=+*#%@" onChange={event=>setAsciiCustomSet(event.target.value.slice(0,96))}/><small>{Array.from(asciiCustomSet).length || t("Default ramp")}</small></label>}
              </div>}
              {effect!=="ASCII"&&effect!=="None"&&<><RangeControl label={t("Intensity")} value={effectIntensity} min={0} max={100} suffix="%" onChange={setEffectIntensity}/>{effect==="Chromatic"&&<RangeControl label={t("Blur")} value={effectBlur} min={0} max={24} suffix="px" onChange={setEffectBlur}/>}{effect==="Duotone"&&<div className="duotone-palettes"><TonePalette label="First tone" color={duotoneDarkColor} colors={paletteColors} onChange={setDuotoneDarkColor} t={t}/><TonePalette label="Second tone" color={duotoneColor} colors={paletteColors} onChange={setDuotoneColor} t={t}/></div>}<label className="switch-row"><span>{t("Affect background")}</span><input type="checkbox" checked={effectBackground} onChange={event=>setEffectBackground(event.target.checked)}/><i/></label></>}
            </div>
          </details>

          {activeShape?.kind!=="object"&&<details className="property-section deform-section" open>
            <summary><HugeiconsIcon className="section-expand" icon={AddIcon} size={12} aria-hidden="true"/><HugeiconsIcon className="section-collapse" icon={Remove01Icon} size={12} aria-hidden="true"/><span>{t("Deform")}</span><button onClick={(e)=>{e.preventDefault();resetDeform();}} aria-label="Reset deformation"><HugeiconsIcon icon={RefreshIcon} size={14} aria-hidden="true"/></button></summary>
            <div className="section-body deform-grid">
              <RangeControl label={t("Bend")} value={bend} min={-120} max={120} suffix="°" onChange={setBend}/>
              <RangeControl label={t("Bulge")} value={bulge} min={-50} max={100} suffix="%" onChange={setBulge}/>
              <RangeControl label={t("Taper")} value={taper} min={-100} max={100} suffix="%" onChange={setTaper}/>
              <RangeControl label={t("Twist")} value={twist} min={-180} max={180} suffix="°" onChange={setTwist}/>
            </div>
          </details>}

          <details className="property-section material-section" open>
            <summary><HugeiconsIcon className="section-expand" icon={AddIcon} size={12} aria-hidden="true"/><HugeiconsIcon className="section-collapse" icon={Remove01Icon} size={12} aria-hidden="true"/><span>{t("Material")}</span><button onClick={(e)=>{e.preventDefault();resetMaterial();}} aria-label="Reset material"><HugeiconsIcon icon={RefreshIcon} size={14} aria-hidden="true"/></button></summary>
            <div className="section-body">
              <div className="control-row"><span>{t("Surface")}</span><output>{activeCustomMaterial?.name??t(material)}</output></div>
              <div className="materials">{materials.map((item) => <button key={item} className={material === item ? "active" : ""} onClick={() => setMaterial(item)}><span className={`material-ball ${item.toLowerCase()}`} /><b>{t(item)}</b></button>)}{customMaterials.map(item=><button key={item.id} className={material===`Custom:${item.id}`?"active":""} onClick={()=>setMaterial(`Custom:${item.id}`)}><span className="material-ball custom-jpg" style={{backgroundImage:`url(${item.source})`}}/><b>{item.name}</b></button>)}</div>
              <button className="material-drop" onClick={()=>materialRef.current?.click()} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();void importMaterial(event.dataTransfer.files[0]);}}><span><HugeiconsIcon icon={AddIcon} size={14} aria-hidden="true"/></span><strong>{t("Drop JPG material")}</strong><small>{t("Recommended: seamless square 1024×1024, sRGB, ≤ 8 MB")}</small></button>
              <input ref={materialRef} className="file-input" type="file" accept=".jpg,.jpeg,image/jpeg" onChange={event=>void importMaterial(event.target.files?.[0])}/>
              {isTexturedMaterial && <div className="texture-controls">
                <div className="texture-credit"><span>{activeCustomMaterial?"JPG":"CC0"}</span> {t(activeCustomMaterial?"Custom diffuse / albedo":material==="Rubber"?"Texture by ambientCG":"Texture by Poly Haven")}</div>
                <RangeControl label={t("Repeat")} value={textureRepeat} min={.5} max={8} step={.5} suffix="×" onChange={setTextureRepeat}/>
                <RangeControl label={t("Rotation")} value={textureRotation} min={-180} max={180} suffix="°" onChange={setTextureRotation}/>
                <RangeControl label={t("Color overlay")} value={textureTint} min={0} max={100} suffix="%" onChange={setTextureTint}/>
                {hasNormalMap&&<><label className="switch-row"><span>{t("Normal map")}</span><input type="checkbox" checked={normalMapEnabled} onChange={event=>setNormalMapEnabled(event.target.checked)}/><i/></label>{normalMapEnabled&&<RangeControl label={t("Normal strength")} value={normalStrength} min={0} max={250} suffix="%" onChange={setNormalStrength}/>}</>}
              </div>}
              {material==="Fur"&&<div className="texture-controls"><RangeControl label={t("Hair length")} value={furLength} min={0} max={100} onChange={setFurLength}/><RangeControl label={t("Hair density")} value={furDensity} min={30} max={220} onChange={setFurDensity}/></div>}
              {material==="Glass"&&<div className="texture-controls glass-controls"><div className="texture-credit"><span>GLASS</span> {t("Physical refraction")}</div><RangeControl label={t("Refraction (IOR)")} value={glassIor} min={1} max={2.33} step={.01} onChange={setGlassIor}/><RangeControl label={t("Transparency")} value={glassTransparency} min={0} max={100} suffix="%" onChange={setGlassTransparency}/></div>}

            </div>
          </details>

          <details className="property-section appearance-section" open>
            <summary><HugeiconsIcon className="section-expand" icon={AddIcon} size={12} aria-hidden="true"/><HugeiconsIcon className="section-collapse" icon={Remove01Icon} size={12} aria-hidden="true"/><span>{t("Appearance")}</span><button onClick={(e)=>{e.preventDefault();resetAppearance();}} aria-label="Reset appearance"><HugeiconsIcon icon={RefreshIcon} size={14} aria-hidden="true"/></button></summary>
            <div className="section-body">
              <div className="fill-modes" role="group" aria-label="Fill type">{(["Solid","Linear","Radial","Angular"] as ColorMode[]).map(mode=><button key={mode} className={colorMode===mode?"active":""} onClick={()=>setColorMode(mode)}>{t(mode)}</button>)}</div>
              {colorMode!=="Solid"&&<div className="gradient-preview" aria-hidden="true" style={{background:colorMode==="Linear"?`linear-gradient(${90-gradientAngle}deg,${color},${gradientColor})`:colorMode==="Radial"?`radial-gradient(ellipse closest-side,${color},${gradientColor})`:`conic-gradient(from ${gradientAngle}deg,${color},${gradientColor})`}}/>}
              <div className="control-row"><span>{t("Color")}</span><input className="color-hex-input" aria-label="HEX color" value={hexDraft} maxLength={7} spellCheck={false} onChange={(e)=>setHexDraft(e.target.value.toUpperCase())} onBlur={commitHex} onKeyDown={(e)=>{if(e.key==="Enter"){commitHex();e.currentTarget.blur();}}}/></div>
              <div className="color-row">{paletteColors.map((item) => <ColorSwatch key={item} color={item} selected={color===item} onChoose={()=>chooseColor(item)} onRemove={()=>setPaletteColors(items=>items.filter(entry=>entry!==item))}/>)}<label className="custom-color"><HugeiconsIcon icon={AddIcon} size={14} aria-hidden="true"/><ColorSpectrum label="Custom color" color={color} onInput={next=>chooseColor(next,false)} onCommit={rememberColor}/></label></div>
              {colorMode!=="Solid"&&<div className="gradient-controls"><TonePalette plain label="Second color" color={gradientColor} colors={paletteColors} onChange={setGradientColor} onCommit={rememberColor} t={t}/>{colorMode!=="Radial"&&<RangeControl label={t("Gradient angle")} value={gradientAngle} min={0} max={360} suffix="°" onChange={setGradientAngle}/>}</div>}
              <div className="mini-controls">
                <RangeControl label={t("Roughness")} value={roughness} min={0} max={100} suffix="%" onChange={setRoughness}/>
                <RangeControl label={t("Color opacity")} value={colorOpacity} min={0} max={100} suffix="%" onChange={setColorOpacity}/>
              </div>
            </div>
          </details>

          <details className="property-section lighting-section" open>
            <summary><HugeiconsIcon className="section-expand" icon={AddIcon} size={12} aria-hidden="true"/><HugeiconsIcon className="section-collapse" icon={Remove01Icon} size={12} aria-hidden="true"/><span>{t("Lighting")}</span><button onClick={(e)=>{e.preventDefault();resetLighting();}} aria-label="Reset lighting"><HugeiconsIcon icon={RefreshIcon} size={14} aria-hidden="true"/></button></summary>
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

          <details className="property-section background-section" open>
            <summary><HugeiconsIcon className="section-expand" icon={AddIcon} size={12} aria-hidden="true"/><HugeiconsIcon className="section-collapse" icon={Remove01Icon} size={12} aria-hidden="true"/><span>{t("Background")}</span><button onClick={(e)=>{e.preventDefault();resetBackground();}} aria-label="Reset background"><HugeiconsIcon icon={RefreshIcon} size={14} aria-hidden="true"/></button></summary>
            <div className="section-body">
              <div className="control-row"><span>{t("Scene")}</span><output>{activeCustomBackground?.name??t(background==="Fill"||background.startsWith("data:image/")?"Custom":background)}</output></div>
              <div className="backgrounds"><button className={background === "None" ? "active none" : "none"} onClick={() => setBackground("None")}><span><HugeiconsIcon icon={Cancel01Icon} size={14} aria-hidden="true"/></span><small>{t("None")}</small></button><button className={background==="Fill"?"active":""} aria-label={language==="ru"?"Свой фон":"Custom background"} onClick={()=>setBackground("Fill")}><span style={{background:backgroundFillCss(backgroundFill)}}/><small>{language==="ru"?"Свой":"Custom"}</small></button>{backgrounds.map((item) => <button key={item} className={`${item.toLowerCase()} ${background === item ? "active" : ""}`} onClick={() => setBackground(item)}><span /><small>{t(item)}</small></button>)}{customBackgrounds.map(item=><BackgroundSwatch key={item.id} item={item} selected={background===item.source} onChoose={()=>setBackground(item.source)} onRemove={()=>deleteBackground(item.id)}/>)}<button className="upload-bg" onClick={() => backgroundRef.current?.click()}><span><HugeiconsIcon icon={AddIcon} size={14} aria-hidden="true"/></span><small>{t("Upload")}</small></button></div>
              {background==="Fill"&&<div className="gradient-controls background-fill">
                <div className="fill-modes" role="group" aria-label="Background fill type">{(["Solid","Linear","Radial","Angular"] as ColorMode[]).map(mode=><button key={mode} className={backgroundFill.colorMode===mode?"active":""} onClick={()=>setBackgroundFill(current=>({...current,colorMode:mode}))}>{t(mode)}</button>)}</div>
                <div className="gradient-preview" aria-hidden="true" style={{background:backgroundFillCss(backgroundFill)}}/>
                <TonePalette plain label="Color" color={backgroundFill.color} colors={paletteColors} onChange={color=>setBackgroundFill(current=>({...current,color}))} t={t}/>
                {backgroundFill.colorMode!=="Solid"&&<><TonePalette plain label="Second color" color={backgroundFill.gradientColor} colors={paletteColors} onChange={gradientColor=>setBackgroundFill(current=>({...current,gradientColor}))} t={t}/>{backgroundFill.colorMode!=="Radial"&&<RangeControl label={t("Gradient angle")} value={backgroundFill.gradientAngle} min={0} max={360} suffix="°" onChange={gradientAngle=>setBackgroundFill(current=>({...current,gradientAngle}))}/>}</>}
              </div>}
              <input ref={backgroundRef} className="file-input" type="file" accept="image/*" onChange={(e) => {importBackground(e.target.files?.[0]);e.currentTarget.value="";}} />
            </div>
          </details>
        </aside>
      </section>

      <footer className="exportbar">
        <div className="export-title"><div><b>{t("Ready to export")}</b></div></div>
        <div className={`export-actions ${effect==="ASCII"?"ascii-export":""}`}>
          <button onClick={() => { stageRef.current?.exportPng(`${fileName.replace(/\.[^.]+$/, "")}-3d`,false); flash("Transparent PNG exported"); }}><span><HugeiconsIcon icon={ArrowDown01Icon} size={14} aria-hidden="true"/></span><div><b>PNG</b></div></button>
          <button onClick={() => { stageRef.current?.exportPng(`${fileName.replace(/\.[^.]+$/, "")}-3d-bg`,true); flash("PNG with background exported"); }}><span><HugeiconsIcon icon={Image01Icon} size={14} aria-hidden="true"/></span><div><b>PNG + BG</b></div></button>
          <button disabled={embedBusy} onClick={()=>void prepareEmbed()}><span><HugeiconsIcon icon={CodeIcon} size={14} aria-hidden="true"/></span><div><b>{embedBusy?"Preparing…":"Embed"}</b></div></button>
          {effect==="ASCII"&&<button onClick={()=>{stageRef.current?.exportTxt(`${fileName.replace(/\.[^.]+$/,"")}-ascii`);flash("ASCII text exported");}}><span><HugeiconsIcon icon={TextIcon} size={14} aria-hidden="true"/></span><div><b>TXT</b></div></button>}
          <button onClick={() => { stageRef.current?.exportObj(fileName.replace(/\.[^.]+$/, "")); flash("OBJ geometry exported"); }}><span><HugeiconsIcon icon={CubeIcon} size={14} aria-hidden="true"/></span><div><b>OBJ</b></div></button>
        </div>
      </footer>

      <section className="mobile-gate" aria-label="Desktop only">
        <div className="mobile-logo"><img src={publicAsset("favicon.svg")} alt="Playtools logo"/></div>
        <h1>Playtools</h1>
        <p>{t("Playtools are available on desktop only.")}</p>
        <a className="author-badge" href="https://razuvaev.me" target="_blank" rel="noreferrer"><img src={publicAsset("rzw.svg")} alt=""/><strong>Alexey Razuvaev</strong></a>
      </section>

      {interfaceHidden&&<div className="fullscreen-actions"><button onClick={()=>setInterfaceHidden(false)}>{t("Show UI")}</button><button onClick={()=>stageRef.current?.exportPng(`${fileName.replace(/\.[^.]+$/,"")}-3d`,false)}><HugeiconsIcon icon={ArrowDown01Icon} size={14} aria-hidden="true"/> PNG</button><button onClick={()=>stageRef.current?.exportPng(`${fileName.replace(/\.[^.]+$/,"")}-3d-bg`,true)}><HugeiconsIcon icon={Image01Icon} size={14} aria-hidden="true"/> PNG + BG</button>{effect==="ASCII"&&<button onClick={()=>stageRef.current?.exportTxt(`${fileName.replace(/\.[^.]+$/,"")}-ascii`)}><HugeiconsIcon icon={TextIcon} size={14} aria-hidden="true"/> TXT</button>}<button onClick={()=>stageRef.current?.exportObj(fileName.replace(/\.[^.]+$/, ""))}><HugeiconsIcon icon={CubeIcon} size={14} aria-hidden="true"/> OBJ</button></div>}

      {embedOpen && <div className="modal-backdrop" onMouseDown={() => setEmbedOpen(false)}><div className="modal" onMouseDown={(e) =>e.stopPropagation()}><button className="modal-close" aria-label={t("Close")} onClick={() => setEmbedOpen(false)}><HugeiconsIcon icon={Cancel01Icon} size={14} aria-hidden="true"/></button><span className="eyebrow">{t("INTERACTIVE EMBED")}</span><h3>{t("Put this shape anywhere.")}</h3><p>{t("Copy the snippet and paste it into your site. The model keeps rotation, material and color settings.")}</p><pre data-embed-code={embedCode}>{embedCode.length>900?`${embedCode.slice(0,900)}…`:embedCode}</pre><button className="copy-button" onClick={() => { void navigator.clipboard.writeText(embedCode).then(()=>flash("Embed code copied")); }}>{t("Copy embed code")}</button></div></div>}
      {toast && <div className="toast"><span><HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} aria-hidden="true"/></span>{toast}</div>}
    </main>
  );
}

export default function App(){
  const embedMode=typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("embed")==="1";
  return embedMode?<EmbedViewer/>:<Home/>;
}

import * as THREE from "three";
import {gradientStops} from "./gradientStops.ts";
import type {GradientSettings} from "./gradientMaterial.ts";

type ExportAppearance=GradientSettings & {color:string};
export function gradientVertexColor(point:THREE.Vector3,bounds:THREE.Box3,appearance:ExportAppearance){
  const size=bounds.getSize(new THREE.Vector3());
  const x=(point.x-bounds.min.x)/Math.max(.0001,size.x)-.5,y=(point.y-bounds.min.y)/Math.max(.0001,size.y)-.5;
  const angle=THREE.MathUtils.degToRad(appearance.gradientAngle),dx=Math.cos(angle),dy=Math.sin(angle);
  let t=.5+(x*dx+y*dy)/Math.max(Math.abs(dx)+Math.abs(dy),.0001);
  if(appearance.colorMode==="Radial")t=Math.hypot(x,y)*2;
  if(appearance.colorMode==="Angular")t=x*x+y*y<=.00000001?0:THREE.MathUtils.euclideanModulo(Math.atan2(x,y)/(Math.PI*2)-angle/(Math.PI*2)+1,1);
  t=THREE.MathUtils.clamp(t,0,1);
  const stops=gradientStops(appearance.gradientStops,appearance.color,appearance.gradientColor);
  const result=new THREE.Color(stops[0].color);
  for(let i=1;i<stops.length;i++)result.lerp(new THREE.Color(stops[i].color),THREE.MathUtils.clamp((t-stops[i-1].position)/Math.max(.00000001,stops[i].position-stops[i-1].position),0,1));
  return result;
}

export async function embedFbxTextures(model:THREE.Object3D){
  const textures=new Set<THREE.Texture>();
  model.traverse(child=>{if(child instanceof THREE.Mesh&&!child.userData.furShell){
    for(const material of Array.isArray(child.material)?child.material:[child.material]){
      const source=material as THREE.MeshStandardMaterial;
      for(const texture of [source.map,source.normalMap])if(texture)textures.add(texture);
    }
  }});
  const embedded=new Map<THREE.Texture,string>();
  for(const texture of textures){
    await texture.userData.ready;
    const image=texture.image as HTMLImageElement|HTMLCanvasElement|ImageBitmap|undefined;
    if(!image)throw new Error("Texture has not loaded yet");
    if(image instanceof HTMLImageElement)await image.decode();
    const canvas=document.createElement("canvas");canvas.width=image.width;canvas.height=image.height;
    const context=canvas.getContext("2d");if(!context||!canvas.width||!canvas.height)throw new Error("Could not read texture");
    context.drawImage(image,0,0);
    embedded.set(texture,canvas.toDataURL("image/png").split(",")[1]);
    canvas.width=canvas.height=0;
  }
  return embedded;
}

function materialFbx(material:THREE.Material,id:number,vertexColors=false){
  const source=material as THREE.MeshPhysicalMaterial;
  const color=vertexColors?new THREE.Color(0xffffff):(source.color??new THREE.Color(0xffffff)),metalness=source.metalness??0,roughness=source.roughness??.5;
  const rgb=(value:THREE.Color)=>value.clone().convertLinearToSRGB().toArray().join(",");
  const specular=new THREE.Color(.04,.04,.04).lerp(color,metalness);
  // FBX Phong approximates PBR; retain the original PBR values for compatible importers.
  const shininess=Math.min(1000,Math.max(0,2/Math.max(.04,roughness)**2-2));
  return `\tMaterial: ${id}, "Material::Material${id}", "" {
\t\tVersion: 102
\t\tShadingModel: "phong"
\t\tMultiLayer: 0
\t\tProperties70:  {
\t\t\tP: "DiffuseColor", "Color", "", "A",${rgb(color)}
\t\t\tP: "DiffuseFactor", "Number", "", "A",1
\t\t\tP: "SpecularColor", "Color", "", "A",${rgb(specular)}
\t\t\tP: "SpecularFactor", "Number", "", "A",1
\t\t\tP: "Shininess", "Number", "", "A",${shininess}
\t\t\tP: "Opacity", "Number", "", "A",${material.opacity}
\t\t\tP: "TransparencyFactor", "Number", "", "A",${1-material.opacity}
\t\t\tP: "ReflectionFactor", "Number", "", "A",${metalness}
\t\t\tP: "EmissiveColor", "Color", "", "A",${rgb(source.emissive??new THREE.Color(0))}
\t\t\tP: "EmissiveFactor", "Number", "", "A",${source.emissiveIntensity??1}
\t\t\tP: "Roughness", "Number", "", "AU",${roughness}
\t\t\tP: "Metalness", "Number", "", "AU",${metalness}
\t\t\tP: "IOR", "Number", "", "AU",${source.ior??1.5}
\t\t\tP: "Transmission", "Number", "", "AU",${source.transmission??0}
\t\t}
\t}`;
}
export function exportFbx(model:THREE.Object3D,appearance?:ExportAppearance,embedded=new Map<THREE.Texture,string>()){
  const gradient=Boolean(appearance&&appearance.colorMode!=="Solid"&&appearance.colorMode!=="Image");
  model.updateMatrixWorld(true);
  const objects:string[]=[],connections:string[]=[];
  let id=1000;
  model.traverse(child=>{
    if(!(child instanceof THREE.Mesh)||child.userData.furShell)return;
    const geometry:THREE.BufferGeometry=child.geometry;
    const index=geometry.index,position=geometry.getAttribute("position");
    if(!position)return;
    const vertices:number[]=[],polygons:number[]=[],normals:number[]=[],uvs:number[]=[],colors:number[]=[],materialIndices:number[]=[];
    const materials=Array.isArray(child.material)?child.material:[child.material];
    geometry.computeBoundingBox();
    const normal=geometry.getAttribute("normal"),uv=geometry.getAttribute("uv");
    const hasUv=Boolean(uv||materials.some((material:THREE.Material)=>{const source=material as THREE.MeshStandardMaterial;return source.map||source.normalMap;}));
    const localPoint=new THREE.Vector3(),mappedUv=new THREE.Vector2();
    const normalMatrix=new THREE.Matrix3().getNormalMatrix(child.matrixWorld),vector=new THREE.Vector3();
    const mirrored=child.matrixWorld.determinant()<0;
    const count=index?index.count:position.count;
    for(let offset=0;offset+2<count;offset+=3){
      const group=geometry.groups.find(group=>offset>=group.start&&offset<group.start+group.count);
      const materialIndex=Math.max(0,Math.min(materials.length-1,group?.materialIndex??0));
      materialIndices.push(materialIndex);
      const source=materials[materialIndex] as THREE.MeshStandardMaterial;
      // Dominant face projection approximates the editor's blended triplanar mapping.
      const faceNormal=new THREE.Vector3();
      if(source.userData.triplanarApplied){
        const a=index?index.getX(offset):offset,b=index?index.getX(offset+1):offset+1,c=index?index.getX(offset+2):offset+2;
        const ab=new THREE.Vector3().fromBufferAttribute(position,b).sub(new THREE.Vector3().fromBufferAttribute(position,a));
        faceNormal.fromBufferAttribute(position,c).sub(new THREE.Vector3().fromBufferAttribute(position,a)).cross(ab).normalize();
      }
      const map=source.map??source.normalMap;map?.updateMatrix();
      for(const corner of mirrored?[0,2,1]:[0,1,2]){
        const vertex=index?index.getX(offset+corner):offset+corner;
        vector.fromBufferAttribute(position,vertex).applyMatrix4(child.matrixWorld);vertices.push(vector.x,vector.y,vector.z);
        const next=vertices.length/3-1;polygons.push(polygons.length%3===2?-next-1:next);
        if(normal){vector.fromBufferAttribute(normal,vertex).applyNormalMatrix(normalMatrix);normals.push(vector.x,vector.y,vector.z);}
        localPoint.fromBufferAttribute(position,vertex);
        if(gradient){const color=gradientVertexColor(localPoint,geometry.boundingBox!,appearance!).convertLinearToSRGB();colors.push(color.r,color.g,color.b,1);}
        if(source.userData.triplanarApplied){
          const n=faceNormal;
          if(Math.abs(n.x)>Math.abs(n.y)&&Math.abs(n.x)>Math.abs(n.z))mappedUv.set(localPoint.z/3+.5,localPoint.y/3+.5);
          else if(Math.abs(n.y)>Math.abs(n.z))mappedUv.set(localPoint.x/3+.5,localPoint.z/3+.5);
          else mappedUv.set(localPoint.x/3+.5,localPoint.y/3+.5);
        }else mappedUv.set(uv?uv.getX(vertex):0,uv?uv.getY(vertex):0);
        if(map)mappedUv.applyMatrix3(map.matrix);
        if(hasUv)uvs.push(mappedUv.x,mappedUv.y);
      }
    }
    const geometryId=id++,modelId=id++;
    objects.push(`\tGeometry: ${geometryId}, "Geometry::Mesh${geometryId}", "Mesh" {
\t\tVertices: *${vertices.length} {
\t\t\ta: ${vertices.join(',')}
\t\t}
\t\tPolygonVertexIndex: *${polygons.length} {
\t\t\ta: ${polygons.join(',')}
\t\t}
${normals.length?`\t\tLayerElementNormal: 0 {
\t\t\tVersion: 101
\t\t\tName: ""
\t\t\tMappingInformationType: "ByPolygonVertex"
\t\t\tReferenceInformationType: "Direct"
\t\t\tNormals: *${normals.length} {
\t\t\t\ta: ${normals.join(',')}
\t\t\t}
\t\t}`:''}
${uvs.length?`\t\tLayerElementUV: 0 {
\t\t\tVersion: 101
\t\t\tName: "UVMap"
\t\t\tMappingInformationType: "ByPolygonVertex"
\t\t\tReferenceInformationType: "Direct"
\t\t\tUV: *${uvs.length} {
\t\t\t\ta: ${uvs.join(',')}
\t\t\t}
\t\t}`:''}
${colors.length?`\t\tLayerElementColor: 0 {
\t\t\tVersion: 101
\t\t\tName: "Color"
\t\t\tMappingInformationType: "ByPolygonVertex"
\t\t\tReferenceInformationType: "Direct"
\t\t\tColors: *${colors.length} {
\t\t\t\ta: ${colors.join(',')}
\t\t\t}
\t\t}`:''}
\t\tLayerElementMaterial: 0 {
\t\t\tVersion: 101
\t\t\tName: ""
\t\t\tMappingInformationType: "ByPolygon"
\t\t\tReferenceInformationType: "IndexToDirect"
\t\t\tMaterials: *${materialIndices.length} {
\t\t\t\ta: ${materialIndices.join(',')}
\t\t\t}
\t\t}
\t\tLayer: 0 {
\t\t\tVersion: 100
${colors.length?`\t\t\tLayerElement:  {
\t\t\t\tType: "LayerElementColor"
\t\t\t\tTypedIndex: 0
\t\t\t}`:''}
${normals.length?`\t\t\tLayerElement:  {
\t\t\t\tType: "LayerElementNormal"
\t\t\t\tTypedIndex: 0
\t\t\t}`:''}
${uvs.length?`\t\t\tLayerElement:  {
\t\t\t\tType: "LayerElementUV"
\t\t\t\tTypedIndex: 0
\t\t\t}`:''}
\t\t\tLayerElement:  {
\t\t\t\tType: "LayerElementMaterial"
\t\t\t\tTypedIndex: 0
\t\t\t}
\t\t}
\t}
\tModel: ${modelId}, "Model::Mesh${modelId}", "Mesh" {
\t\tVersion: 232
\t\tShading: T
\t\tCulling: "CullingOff"
\t}`);
    for(const material of materials){
      const materialId=id++;objects.push(materialFbx(material,materialId,gradient));connections.push(`\tC: "OO",${materialId},${modelId}`);
      const source=material as THREE.MeshStandardMaterial;
      for(const [texture,property] of [[source.map,"DiffuseColor"],[source.normalMap,"NormalMap"]] as const){
        if(!texture)continue;
        const content=embedded.get(texture);if(!content)throw new Error("Texture image is missing from FBX export");
        const textureId=id++,videoId=id++,filename=`texture${textureId}.png`;
        objects.push(`\tVideo: ${videoId}, "Video::Texture${textureId}", "Clip" {
\t\tType: "Clip"
\t\tFilename: "${filename}"
\t\tRelativeFilename: "${filename}"
\t\tContent: ,
\t\t "${content}"
\t}
\tTexture: ${textureId}, "Texture::Texture${textureId}", "" {
\t\tType: "TextureVideoClip"
\t\tVersion: 202
\t\tTextureName: "Texture::Texture${textureId}"
\t\tMedia: "Video::Texture${textureId}"
\t\tFileName: "${filename}"
\t\tRelativeFilename: "${filename}"
\t\tProperties70:  {
\t\t\tP: "WrapModeU", "enum", "", "",${texture.wrapS===THREE.RepeatWrapping?0:1}
\t\t\tP: "WrapModeV", "enum", "", "",${texture.wrapT===THREE.RepeatWrapping?0:1}
\t\t}
\t}`);
        connections.push(`\tC: "OO",${videoId},${textureId}`,`\tC: "OP",${textureId},${materialId},"${property}"`);
      }
    }
    connections.push(`\tC: "OO",${geometryId},${modelId}`,`\tC: "OO",${modelId},0`);
  });
  if(!objects.length)throw new Error("No geometry to export");
  return `; FBX 7.4.0 project file
FBXHeaderExtension:  {
\tFBXHeaderVersion: 1003
\tFBXVersion: 7400
}
Objects:  {
${objects.join('\n')}
}
Connections:  {
${connections.join('\n')}
}
`;
}

import * as THREE from "three";

// Geometry-only FBX, matching the existing OBJ export; shader effects stay in the editor.
export function exportFbx(model:THREE.Object3D){
  model.updateMatrixWorld(true);
  const objects:string[]=[],connections:string[]=[];
  let id=1000;
  model.traverse(child=>{
    if(!(child instanceof THREE.Mesh)||child.userData.furShell)return;
    const geometry=child.geometry,index=geometry.index,position=geometry.getAttribute("position");
    if(!position)return;
    const vertices:number[]=[],polygons:number[]=[],normals:number[]=[],uvs:number[]=[];
    const normal=geometry.getAttribute("normal"),uv=geometry.getAttribute("uv");
    const normalMatrix=new THREE.Matrix3().getNormalMatrix(child.matrixWorld),vector=new THREE.Vector3();
    const mirrored=child.matrixWorld.determinant()<0;
    const count=index?index.count:position.count;
    for(let offset=0;offset+2<count;offset+=3){
      for(const corner of mirrored?[0,2,1]:[0,1,2]){
        const vertex=index?index.getX(offset+corner):offset+corner;
        vector.fromBufferAttribute(position,vertex).applyMatrix4(child.matrixWorld);vertices.push(vector.x,vector.y,vector.z);
        const next=vertices.length/3-1;polygons.push(polygons.length%3===2?-next-1:next);
        if(normal){vector.fromBufferAttribute(normal,vertex).applyNormalMatrix(normalMatrix);normals.push(vector.x,vector.y,vector.z);}
        if(uv)uvs.push(uv.getX(vertex),uv.getY(vertex));
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
\t}
\tModel: ${modelId}, "Model::Mesh${modelId}", "Mesh" {
\t\tVersion: 232
\t\tShading: T
\t\tCulling: "CullingOff"
\t}`);
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

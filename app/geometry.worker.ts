import * as THREE from "three";
import { mergeVertices, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

type ShapeData={outer:number[][];holes:number[][][]};
type GeometryRequest={id:number;shapes:ShapeData[];thickness:number;segments:number;surfaceDetail:number;edge:number;mass:number;bend:number;bulge:number;taper:number;twist:number};

function makeShapes(sampled:ShapeData[]){
  const cleanRing=(items:number[][])=>{const result:number[][]=[];for(const point of items){const previous=result[result.length-1];if(!previous||Math.hypot(point[0]-previous[0],point[1]-previous[1])>1e-6)result.push(point);}if(result.length>2&&Math.hypot(result[0][0]-result[result.length-1][0],result[0][1]-result[result.length-1][1])<1e-6)result.pop();return result;};
  const clean=sampled.map(shape=>({outer:cleanRing(shape.outer),holes:shape.holes.map(cleanRing).filter(ring=>ring.length>=3)})).filter(shape=>shape.outer.length>=3);
  const points=clean.flatMap(shape=>[shape.outer,...shape.holes]).flat().map(([x,y])=>new THREE.Vector2(x,y));
  const box=new THREE.Box2().setFromPoints(points);const center=box.getCenter(new THREE.Vector2());const size=box.getSize(new THREE.Vector2());const scale=3/Math.max(size.x,size.y,.001);
  const path=(target:THREE.Path,items:number[][])=>items.forEach(([px,py],index)=>{const x=(px-center.x)*scale,y=(py-center.y)*scale;index?target.lineTo(x,y):target.moveTo(x,y);});
  const holeSizes=clean.flatMap(shape=>shape.holes).map(ring=>{const ringBox=new THREE.Box2().setFromPoints(ring.map(([x,y])=>new THREE.Vector2(x,y)));const ringSize=ringBox.getSize(new THREE.Vector2());return Math.min(ringSize.x,ringSize.y)*scale;});
  return {shapes:clean.map(data=>{const shape=new THREE.Shape();path(shape,data.outer);shape.closePath();data.holes.forEach(items=>{const hole=new THREE.Path();path(hole,items);hole.closePath();shape.holes.push(hole);});return shape;}),size:new THREE.Vector2(size.x*scale,size.y*scale),holeLimit:holeSizes.length?Math.min(...holeSizes):Infinity,hasHoles:holeSizes.length>0};
}

/**
 * Subdivide the complete closed shell with one shared division level. Splitting
 * only the caps makes their boundary curve under a nonlinear deformation while
 * the neighbouring bevel edge remains a straight chord, which opens visible
 * cracks. Uniform edge samples keep caps, bevels and side walls coincident.
 */
function subdivideShell(source:THREE.BufferGeometry,requestedDivisions:number){
  const geometry=source.index?source.toNonIndexed():source;
  const positions=geometry.attributes.position as THREE.BufferAttribute;
  const uvs=geometry.attributes.uv as THREE.BufferAttribute|undefined;
  const triangleCount=positions.count/3;
  // The requested division multiplies triangle count by n². Keep enough room
  // for complex SVGs without returning to the previous 500k-triangle meshes.
  const budgeted=Math.max(1,Math.floor(Math.sqrt(160000/Math.max(1,triangleCount))));
  const divisions=Math.max(1,Math.min(5,Math.round(requestedDivisions),budgeted));
  if(divisions===1)return geometry;
  const nextPositions:number[]=[],nextUvs:number[]=[];
  const add=(triangle:number[],triangleUvs:number[])=>{nextPositions.push(...triangle);if(uvs)nextUvs.push(...triangleUvs);};
  const sample=(triangle:number[],i:number,j:number,n:number,itemSize:number)=>{
    const wb=i/n,wc=j/n,wa=1-wb-wc,result:number[]=[];
    for(let k=0;k<itemSize;k++)result.push(triangle[k]*wa+triangle[itemSize+k]*wb+triangle[itemSize*2+k]*wc);
    return result;
  };
  for(let vertex=0;vertex<positions.count;vertex+=3){
    const triangle:number[]=[],triangleUvs:number[]=[];
    for(let corner=0;corner<3;corner++){
      triangle.push(positions.getX(vertex+corner),positions.getY(vertex+corner),positions.getZ(vertex+corner));
      if(uvs)triangleUvs.push(uvs.getX(vertex+corner),uvs.getY(vertex+corner));
    }
    for(let i=0;i<divisions;i++)for(let j=0;j<divisions-i;j++){
      const p00=sample(triangle,i,j,divisions,3),p10=sample(triangle,i+1,j,divisions,3),p01=sample(triangle,i,j+1,divisions,3);
      const u00=uvs?sample(triangleUvs,i,j,divisions,2):[],u10=uvs?sample(triangleUvs,i+1,j,divisions,2):[],u01=uvs?sample(triangleUvs,i,j+1,divisions,2):[];
      add([...p00,...p10,...p01],[...u00,...u10,...u01]);
      if(i+j<divisions-1){
        const p11=sample(triangle,i+1,j+1,divisions,3),u11=uvs?sample(triangleUvs,i+1,j+1,divisions,2):[];
        add([...p10,...p11,...p01],[...u10,...u11,...u01]);
      }
    }
  }
  const result=new THREE.BufferGeometry();
  result.setAttribute("position",new THREE.Float32BufferAttribute(nextPositions,3));
  if(uvs)result.setAttribute("uv",new THREE.Float32BufferAttribute(nextUvs,2));
  return result;
}

function build(data:GeometryRequest){
  const normalized=makeShapes(data.shapes);const depth=THREE.MathUtils.mapLinear(data.thickness,8,300,.12,3.5);const edgeAmount=data.edge/300;
  const active=Math.abs(data.mass)+Math.abs(data.bend)+Math.abs(data.bulge)+Math.abs(data.taper)+Math.abs(data.twist)>0;
  // Intermediate depth rings keep the side wall connected when the front and
  // back caps move far apart under Mass or another deformation.
  const depthSteps=active?Math.max(2,Math.min(5,Math.round(data.surfaceDetail))):1;
  const safeRadius=Math.min(.1,Math.min(normalized.size.x,normalized.size.y)*.06,normalized.holeLimit*.1,depth*.45)*edgeAmount;
  // More than sixteen bevel rings is visually redundant at this scale and can
  // multiply complex SVGs into hundreds of thousands of triangles.
  const bevelSegments=Math.max(1,Math.round(THREE.MathUtils.lerp(1,16,Math.sqrt(THREE.MathUtils.clamp(edgeAmount,0,1)))));
  // Start the bevel on the exact source outline. A negative offset expands the
  // cap into concave joins (notably the bowl/stem junction in grotesque P) and
  // makes Three's offset rings cross before triangulation.
  let geometry:THREE.BufferGeometry=new THREE.ExtrudeGeometry(normalized.shapes,{depth,steps:depthSteps,bevelEnabled:data.edge>0,bevelSegments,bevelSize:safeRadius,bevelThickness:safeRadius,bevelOffset:0,curveSegments:data.segments});
  geometry.computeBoundingBox();const before=geometry.boundingBox!;const size=new THREE.Vector3();before.getSize(size);const scale=3/Math.max(size.x,size.y);geometry.scale(scale,-scale,1);geometry.center();
  if(active)geometry=subdivideShell(geometry,data.surfaceDetail);
  geometry=mergeVertices(geometry,1e-4);geometry.computeBoundingBox();const box=geometry.boundingBox!;const hx=Math.max(.001,(box.max.x-box.min.x)/2),hy=Math.max(.001,(box.max.y-box.min.y)/2),hz=Math.max(.001,(box.max.z-box.min.z)/2);const cx=(box.min.x+box.max.x)/2,cy=(box.min.y+box.max.y)/2,cz=(box.min.z+box.max.z)/2;const position=geometry.attributes.position as THREE.BufferAttribute;const mass=data.mass/100,bend=THREE.MathUtils.degToRad(data.bend),twist=THREE.MathUtils.degToRad(data.twist);
  for(let i=0;i<position.count;i++){let x=position.getX(i),y=position.getY(i),z=position.getZ(i);const xn=THREE.MathUtils.clamp((x-cx)/hx,-1,1),yn=THREE.MathUtils.clamp((y-cy)/hy,-1,1),zn=THREE.MathUtils.clamp((z-cz)/hz,-1,1),radial=Math.max(0,1-xn*xn-yn*yn);x=cx+(x-cx)*(1+data.bulge/100*(1-yn*yn)*.36)*(1+data.taper/100*yn*.38)*(1+mass*.08);y=cy+(y-cy)*(1+data.bulge/100*(1-xn*xn)*.18)*(1+mass*.08);if(Math.abs(bend)>.001)x+=Math.sin(yn*Math.PI*.5)*hx*bend*.25;if(Math.abs(twist)>.001){const angle=twist*yn*.34,c=Math.cos(angle),s=Math.sin(angle),dx=x-cx,dy=y-cy;x=cx+dx*c-dy*s;y=cy+dx*s+dy*c;}z=cz+(z-cz)*(1+mass*.18)+zn*hz*mass*radial*.48;position.setXYZ(i,x,y,z);}
  position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  // A low fixed crease angle made gently curved cap triangles shade as separate
  // facets. The bevel amount now controls a broader, genuinely smooth normal
  // transition while the 90-degree non-bevel edge remains crisp.
  const creaseDegrees=THREE.MathUtils.lerp(38,80,THREE.MathUtils.clamp(data.edge/300,0,1));
  // Three's helper groups positions on a fixed 0.01-unit grid. Dense meshes
  // can put unrelated vertices in the same cell, producing the radial bands
  // seen on complex shapes. Temporarily scaling the geometry makes that grid
  // precise to 0.00001 model units without changing the resulting normals.
  geometry.scale(1000,1000,1000);
  geometry=toCreasedNormals(geometry,THREE.MathUtils.degToRad(creaseDegrees));
  geometry.scale(.001,.001,.001);
  const p=(geometry.attributes.position.array as Float32Array),n=(geometry.attributes.normal.array as Float32Array),uv=geometry.attributes.uv?(geometry.attributes.uv.array as Float32Array):new Float32Array();return {id:data.id,position:p,normal:n,uv,triangles:p.length/9};
}

(self as any).onmessage=(event:MessageEvent<GeometryRequest>)=>{try{const result=build(event.data);(self as any).postMessage(result,[result.position.buffer,result.normal.buffer,result.uv.buffer]);}catch(error){(self as any).postMessage({id:event.data.id,error:error instanceof Error?error.message:"Geometry error"});}};

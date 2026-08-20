import * as THREE from "three";
import { mergeVertices, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

type ShapeData={outer:number[][];holes:number[][][]};
type GeometryRequest={id:number;shapes:ShapeData[];geometryMode:"Extrude"|"Revolve"|"Inflate";thickness:number;segments:number;surfaceDetail:number;edge:number;mass:number;inflateAmount:number;bend:number;bulge:number;taper:number;twist:number};

function makeShapes(sampled:ShapeData[]){
  const cleanRing=(items:number[][])=>{const result:number[][]=[];for(const point of items){const previous=result[result.length-1];if(!previous||Math.hypot(point[0]-previous[0],point[1]-previous[1])>1e-6)result.push(point);}if(result.length>2&&Math.hypot(result[0][0]-result[result.length-1][0],result[0][1]-result[result.length-1][1])<1e-6)result.pop();return result;};
  const clean=sampled.map(shape=>({outer:cleanRing(shape.outer),holes:shape.holes.map(cleanRing).filter(ring=>ring.length>=3)})).filter(shape=>shape.outer.length>=3);
  const points=clean.flatMap(shape=>[shape.outer,...shape.holes]).flat().map(([x,y])=>new THREE.Vector2(x,y));
  const box=new THREE.Box2().setFromPoints(points);const center=box.getCenter(new THREE.Vector2());const size=box.getSize(new THREE.Vector2());const scale=3/Math.max(size.x,size.y,.001);
  const normalizedPoint=([px,py]:number[])=>[(px-center.x)*scale,(py-center.y)*scale];
  const path=(target:THREE.Path,items:number[][])=>items.forEach((point,index)=>{const [x,y]=normalizedPoint(point);index?target.lineTo(x,y):target.moveTo(x,y);});
  const holeSizes=clean.flatMap(shape=>shape.holes).map(ring=>{const ringBox=new THREE.Box2().setFromPoints(ring.map(([x,y])=>new THREE.Vector2(x,y)));const ringSize=ringBox.getSize(new THREE.Vector2());return Math.min(ringSize.x,ringSize.y)*scale;});
  return {shapes:clean.map(data=>{const shape=new THREE.Shape();path(shape,data.outer);shape.closePath();data.holes.forEach(items=>{const hole=new THREE.Path();path(hole,items);hole.closePath();shape.holes.push(hole);});return shape;}),contours:clean.map(data=>({outer:data.outer.map(normalizedPoint),holes:data.holes.map(ring=>ring.map(normalizedPoint))})),size:new THREE.Vector2(size.x*scale,size.y*scale),holeLimit:holeSizes.length?Math.min(...holeSizes):Infinity,hasHoles:holeSizes.length>0};
}

function ringArea(ring:number[][]){let area=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];area+=a[0]*b[1]-b[0]*a[1];}return area*.5;}

function revolveGeometry(contours:ShapeData[],requestedSegments:number){
  const rings=contours.flatMap(shape=>[{points:shape.outer,hole:false},...shape.holes.map(points=>({points,hole:true}))]).filter(item=>item.points.length>=3);
  const all=rings.flatMap(item=>item.points);const minX=Math.min(...all.map(point=>point[0]));
  const pointCount=rings.reduce((sum,item)=>sum+item.points.length,0);
  // A one-to-one mapping made the default 18 segments visibly polygonal.
  // Give the circular sweep a smooth baseline and scale sublinearly up to 512,
  // while keeping complex multi-contour shapes within a predictable budget.
  const desired=Math.round(64+Math.sqrt(Math.max(3,requestedSegments))*14);
  const budgeted=Math.max(72,Math.floor(360000/Math.max(1,pointCount*2)));
  const radialSegments=Math.max(72,Math.min(512,desired,budgeted));
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  for(const item of rings){
    let ring=item.points.slice();
    const shouldBePositive=!item.hole;
    if((ringArea(ring)>0)!==shouldBePositive)ring=ring.reverse();
    const offset=positions.length/3,count=ring.length;
    for(let slice=0;slice<radialSegments;slice++){
      const angle=slice/radialSegments*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle);
      for(let i=0;i<count;i++){
        const radius=Math.max(.025,ring[i][0]-minX+.08);
        positions.push(radius*c,ring[i][1],radius*s);uvs.push(slice/radialSegments,i/count);
      }
    }
    for(let slice=0;slice<radialSegments;slice++){
      const nextSlice=(slice+1)%radialSegments;
      for(let i=0;i<count;i++){
        const next=(i+1)%count,a=offset+slice*count+i,b=offset+slice*count+next,c=offset+nextSlice*count+i,d=offset+nextSlice*count+next;
        indices.push(a,b,c,b,d,c);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function pointSegmentDistance(x:number,y:number,a:number[],b:number[]){const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;if(length<1e-12)return Math.hypot(x-a[0],y-a[1]);const t=THREE.MathUtils.clamp(((x-a[0])*dx+(y-a[1])*dy)/length,0,1);return Math.hypot(x-(a[0]+dx*t),y-(a[1]+dy*t));}

function distanceToContours(x:number,y:number,contours:ShapeData[]){let distance=Infinity;for(const shape of contours)for(const ring of [shape.outer,...shape.holes])for(let i=0;i<ring.length;i++)distance=Math.min(distance,pointSegmentDistance(x,y,ring[i],ring[(i+1)%ring.length]));return distance;}

/**
 * Subdivide the complete closed shell with one shared division level. Splitting
 * only the caps makes their boundary curve under a nonlinear deformation while
 * the neighbouring bevel edge remains a straight chord, which opens visible
 * cracks. Uniform edge samples keep caps, bevels and side walls coincident.
 */
function subdivideShell(source:THREE.BufferGeometry,requestedDivisions:number,triangleBudget=160000,maxDivisions=5){
  const geometry=source.index?source.toNonIndexed():source;
  const positions=geometry.attributes.position as THREE.BufferAttribute;
  const uvs=geometry.attributes.uv as THREE.BufferAttribute|undefined;
  const triangleCount=positions.count/3;
  // The requested division multiplies triangle count by n². Keep enough room
  // for complex SVGs without returning to the previous 500k-triangle meshes.
  const budgeted=Math.max(1,Math.floor(Math.sqrt(triangleBudget/Math.max(1,triangleCount))));
  const divisions=Math.max(1,Math.min(maxDivisions,Math.round(requestedDivisions),budgeted));
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
  const active=data.geometryMode==="Inflate"||Math.abs(data.mass)+Math.abs(data.bend)+Math.abs(data.bulge)+Math.abs(data.taper)+Math.abs(data.twist)>0;
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
  let geometry:THREE.BufferGeometry=data.geometryMode==="Revolve"?revolveGeometry(normalized.contours,data.segments):new THREE.ExtrudeGeometry(normalized.shapes,{depth:data.geometryMode==="Inflate"?Math.max(.08,depth*.32):depth,steps:depthSteps,bevelEnabled:data.edge>0,bevelSegments,bevelSize:safeRadius,bevelThickness:safeRadius,bevelOffset:0,curveSegments:data.segments});
  geometry.computeBoundingBox();const before=geometry.boundingBox!;const size=new THREE.Vector3();before.getSize(size);const scale=3/Math.max(size.x,size.y);geometry.scale(scale,-scale,1);geometry.center();
  const deformationContours=normalized.contours.map(shape=>({outer:shape.outer.map(([x,y])=>[x*scale,-y*scale]),holes:shape.holes.map(ring=>ring.map(([x,y])=>[x*scale,-y*scale]))}));
  if(active)geometry=subdivideShell(geometry,data.geometryMode==="Inflate"?data.surfaceDetail+2:data.surfaceDetail,data.geometryMode==="Inflate"?280000:160000,data.geometryMode==="Inflate"?7:5);
  geometry=mergeVertices(geometry,1e-4);geometry.computeBoundingBox();const box=geometry.boundingBox!;const hx=Math.max(.001,(box.max.x-box.min.x)/2),hy=Math.max(.001,(box.max.y-box.min.y)/2),hz=Math.max(.001,(box.max.z-box.min.z)/2);const cx=(box.min.x+box.max.x)/2,cy=(box.min.y+box.max.y)/2,cz=(box.min.z+box.max.z)/2;const position=geometry.attributes.position as THREE.BufferAttribute;const mass=data.mass/100,bend=THREE.MathUtils.degToRad(data.bend),twist=THREE.MathUtils.degToRad(data.twist);
  for(let i=0;i<position.count;i++){let x=position.getX(i),y=position.getY(i),z=position.getZ(i);const xn=THREE.MathUtils.clamp((x-cx)/hx,-1,1),yn=THREE.MathUtils.clamp((y-cy)/hy,-1,1),zn=THREE.MathUtils.clamp((z-cz)/hz,-1,1),radial=Math.max(0,1-xn*xn-yn*yn);x=cx+(x-cx)*(1+data.bulge/100*(1-yn*yn)*.36)*(1+data.taper/100*yn*.38)*(1+mass*.08);y=cy+(y-cy)*(1+data.bulge/100*(1-xn*xn)*.18)*(1+mass*.08);if(Math.abs(bend)>.001)x+=Math.sin(yn*Math.PI*.5)*hx*bend*.25;if(Math.abs(twist)>.001){const angle=twist*yn*.34,c=Math.cos(angle),s=Math.sin(angle),dx=x-cx,dy=y-cy;x=cx+dx*c-dy*s;y=cy+dx*s+dy*c;}z=cz+(z-cz)*(1+mass*.18)+zn*hz*mass*radial*.48;if(data.geometryMode==="Inflate"&&Math.abs(zn)>.15){const distance=distanceToContours(x,y,deformationContours),falloff=Math.min(.42,Math.max(.08,Math.min(normalized.size.x,normalized.size.y)*scale*.18)),lift=Math.sin(THREE.MathUtils.clamp(distance/falloff,0,1)*Math.PI*.5)*data.inflateAmount/100*.72;z=cz+Math.sign(zn)*(hz+lift);}position.setXYZ(i,x,y,z);}
  position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  // A low fixed crease angle made gently curved cap triangles shade as separate
  // facets. The bevel amount now controls a broader, genuinely smooth normal
  // transition while the 90-degree non-bevel edge remains crisp.
  const creaseDegrees=data.geometryMode==="Revolve"?178:data.geometryMode==="Inflate"?150:THREE.MathUtils.lerp(38,80,THREE.MathUtils.clamp(data.edge/300,0,1));
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

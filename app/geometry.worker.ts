/// <reference lib="webworker" />

import * as THREE from "three";
import { mergeVertices, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

type ShapeData={outer:number[][];holes:number[][][]};
type GeometryRequest={id:number;shapes:ShapeData[];geometryMode:"Extrude"|"Revolve"|"Inflate";thickness:number;segments:number;surfaceDetail:number;edge:number;mass:number;revolveAngle:number;revolveEdge:"Outer"|"Inner";inflateAmount:number;inflateDirection:"Outward"|"Inward";bend:number;bulge:number;taper:number;twist:number};

function makeShapes(sampled:ShapeData[]){
  const cleanRing=(items:number[][])=>{const result:number[][]=[];for(const point of items){const previous=result[result.length-1];if(!previous||Math.hypot(point[0]-previous[0],point[1]-previous[1])>1e-6)result.push(point);}if(result.length>2&&Math.hypot(result[0][0]-result[result.length-1][0],result[0][1]-result[result.length-1][1])<1e-6)result.pop();return result;};
  const clean=sampled.map(shape=>({outer:cleanRing(shape.outer),holes:shape.holes.map(cleanRing).filter(ring=>ring.length>=3)})).filter(shape=>shape.outer.length>=3);
  const points=clean.flatMap(shape=>[shape.outer,...shape.holes]).flat().map(([x,y])=>new THREE.Vector2(x,y));
  const box=new THREE.Box2().setFromPoints(points);const center=box.getCenter(new THREE.Vector2());const size=box.getSize(new THREE.Vector2());const scale=3/Math.max(size.x,size.y,.001);
  const normalizedPoint=([px,py]:number[])=>[(px-center.x)*scale,(py-center.y)*scale];
  const path=(target:THREE.Path,items:number[][])=>items.forEach((point,index)=>{const [x,y]=normalizedPoint(point);if(index)target.lineTo(x,y);else target.moveTo(x,y);});
  const holeSizes=clean.flatMap(shape=>shape.holes).map(ring=>{const ringBox=new THREE.Box2().setFromPoints(ring.map(([x,y])=>new THREE.Vector2(x,y)));const ringSize=ringBox.getSize(new THREE.Vector2());return Math.min(ringSize.x,ringSize.y)*scale;});
  return {shapes:clean.map(data=>{const shape=new THREE.Shape();path(shape,data.outer);shape.closePath();data.holes.forEach(items=>{const hole=new THREE.Path();path(hole,items);hole.closePath();shape.holes.push(hole);});return shape;}),contours:clean.map(data=>({outer:data.outer.map(normalizedPoint),holes:data.holes.map(ring=>ring.map(normalizedPoint))})),size:new THREE.Vector2(size.x*scale,size.y*scale),holeLimit:holeSizes.length?Math.min(...holeSizes):Infinity,hasHoles:holeSizes.length>0};
}

function ringArea(ring:number[][]){let area=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];area+=a[0]*b[1]-b[0]*a[1];}return area*.5;}

function revolveGeometry(contours:ShapeData[],requestedSegments:number,requestedAngle:number,edge:"Outer"|"Inner"){
  const rings=contours.flatMap(shape=>[{points:shape.outer,hole:false},...shape.holes.map(points=>({points,hole:true}))]).filter(item=>item.points.length>=3);
  const all=rings.flatMap(item=>item.points);const minX=Math.min(...all.map(point=>point[0])),maxX=Math.max(...all.map(point=>point[0]));const axisX=edge==="Outer"?minX:maxX;
  const pointCount=rings.reduce((sum,item)=>sum+item.points.length,0);
  // A one-to-one mapping made the default 18 segments visibly polygonal.
  // Give the circular sweep a smooth baseline and scale sublinearly up to 512,
  // while keeping complex multi-contour shapes within a predictable budget.
  const desired=Math.round(64+Math.sqrt(Math.max(3,requestedSegments))*14);
  const budgeted=Math.max(72,Math.floor(360000/Math.max(1,pointCount*2)));
  const fullSegments=Math.max(72,Math.min(512,desired,budgeted));
  const sweepDegrees=THREE.MathUtils.clamp(requestedAngle,0,360),sweep=Math.max(0,THREE.MathUtils.degToRad(sweepDegrees)),closed=sweepDegrees>=359.999;
  const radialSegments=Math.max(1,Math.round(fullSegments*Math.max(sweepDegrees,.25)/360));
  const sliceCount=closed?radialSegments:radialSegments+1;
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  const project=(point:number[],angle:number)=>{const radius=Math.max(.025,edge==="Outer"?point[0]-axisX+.08:axisX-point[0]+.08);return [radius*Math.cos(angle),point[1],radius*Math.sin(angle)];};
  const pushCap=(angle:number,desiredNormal:THREE.Vector3)=>{
    for(const shape of contours){
      const outer=shape.outer.map(([x,y])=>new THREE.Vector2(x,y)),holes=shape.holes.map(ring=>ring.map(([x,y])=>new THREE.Vector2(x,y)));
      const flat=[shape.outer,...shape.holes].flat(),faces=THREE.ShapeUtils.triangulateShape(outer,holes);
      for(const face of faces){
        const triangle=face.map(index=>project(flat[index],angle));
        const a=new THREE.Vector3(...triangle[0] as [number,number,number]),b=new THREE.Vector3(...triangle[1] as [number,number,number]),c=new THREE.Vector3(...triangle[2] as [number,number,number]);
        if(new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).dot(desiredNormal)<0)[triangle[1],triangle[2]]=[triangle[2],triangle[1]];
        const offset=positions.length/3;for(const vertex of triangle){positions.push(vertex[0],vertex[1],vertex[2]);uvs.push((vertex[0]+3)/6,(vertex[1]+3)/6);}indices.push(offset,offset+1,offset+2);
      }
    }
  };
  if(sweepDegrees<=.001){pushCap(0,new THREE.Vector3(0,0,1));const flat=new THREE.BufferGeometry();flat.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));flat.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));flat.setIndex(indices);flat.computeVertexNormals();return flat;}
  for(const item of rings){
    let ring=item.points.slice();
    const shouldBePositive=edge==="Outer"?!item.hole:item.hole;
    if((ringArea(ring)>0)!==shouldBePositive)ring=ring.reverse();
    const offset=positions.length/3,count=ring.length;
    for(let slice=0;slice<sliceCount;slice++){
      const angle=slice/radialSegments*sweep;
      for(let i=0;i<count;i++){
        const vertex=project(ring[i],angle);positions.push(vertex[0],vertex[1],vertex[2]);uvs.push(slice/radialSegments,i/count);
      }
    }
    for(let slice=0;slice<radialSegments;slice++){
      const nextSlice=closed?(slice+1)%radialSegments:slice+1;
      for(let i=0;i<count;i++){
        const next=(i+1)%count,a=offset+slice*count+i,b=offset+slice*count+next,c=offset+nextSlice*count+i,d=offset+nextSlice*count+next;
        indices.push(a,b,c,b,d,c);
      }
    }
  }
  if(!closed){pushCap(0,new THREE.Vector3(0,0,-1));pushCap(sweep,new THREE.Vector3(-Math.sin(sweep),0,Math.cos(sweep)));}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function distanceFieldToContours(x:number,y:number,contours:ShapeData[]){let distance=Infinity,gx=0,gy=0;for(const shape of contours)for(const ring of [shape.outer,...shape.holes])for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length<1e-12?0:THREE.MathUtils.clamp(((x-a[0])*dx+(y-a[1])*dy)/length,0,1),qx=a[0]+dx*t,qy=a[1]+dy*t,px=x-qx,py=y-qy,next=Math.hypot(px,py);if(next<distance){distance=next;if(next>1e-8){gx=px/next;gy=py/next;}}}return {distance,gx,gy};}

function relaxInflateHeights(geometry:THREE.BufferGeometry,distances:Float32Array,iterations=3){
  const index=geometry.index;if(!index)return;const position=geometry.attributes.position as THREE.BufferAttribute,count=position.count,sum=new Float64Array(count),weight=new Uint32Array(count),next=new Float32Array(count);
  const add=(target:number,a:number,b:number)=>{sum[target]+=position.getZ(a)+position.getZ(b);weight[target]+=2;};
  for(let pass=0;pass<iterations;pass++){
    sum.fill(0);weight.fill(0);
    for(let offset=0;offset<index.count;offset+=3){const a=index.getX(offset),b=index.getX(offset+1),c=index.getX(offset+2);add(a,b,c);add(b,a,c);add(c,a,b);}
    for(let i=0;i<count;i++){const current=position.getZ(i);next[i]=distances[i]<1e-5||!weight[i]?current:THREE.MathUtils.lerp(current,sum[i]/weight[i],.42);}
    for(let i=0;i<count;i++)position.setZ(i,next[i]);
  }
  position.needsUpdate=true;
}

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
  const normalized=makeShapes(data.shapes);const depth=THREE.MathUtils.mapLinear(data.thickness,1,300,.035,3.5);const edgeAmount=data.edge/300,isInflate=data.geometryMode==="Inflate";
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
  let geometry:THREE.BufferGeometry=data.geometryMode==="Revolve"
    ?revolveGeometry(normalized.contours,data.segments,data.revolveAngle,data.revolveEdge)
    :new THREE.ExtrudeGeometry(normalized.shapes,{depth:isInflate?.001:depth,steps:isInflate?1:depthSteps,bevelEnabled:!isInflate&&data.edge>0,bevelSegments,bevelSize:safeRadius,bevelThickness:safeRadius,bevelOffset:0,curveSegments:data.segments});
  geometry.computeBoundingBox();const before=geometry.boundingBox!;const size=new THREE.Vector3();before.getSize(size);const scale=3/Math.max(size.x,size.y);geometry.scale(scale,-scale,data.geometryMode==="Revolve"?scale:1);geometry.center();
  const deformationContours=normalized.contours.map(shape=>({outer:shape.outer.map(([x,y])=>[x*scale,-y*scale]),holes:shape.holes.map(ring=>ring.map(([x,y])=>[x*scale,-y*scale]))}));
  if(active){const divisions=isInflate?6+Math.round(data.surfaceDetail)*7:data.surfaceDetail;geometry=subdivideShell(geometry,divisions,isInflate?600000:160000,isInflate?42:5);}
  geometry=mergeVertices(geometry,isInflate?1e-5:1e-4);geometry.computeBoundingBox();const box=geometry.boundingBox!;const hx=Math.max(.001,(box.max.x-box.min.x)/2),hy=Math.max(.001,(box.max.y-box.min.y)/2),hz=Math.max(.00001,(box.max.z-box.min.z)/2);const cx=(box.min.x+box.max.x)/2,cy=(box.min.y+box.max.y)/2,cz=(box.min.z+box.max.z)/2;const position=geometry.attributes.position as THREE.BufferAttribute;const inflateDistances=isInflate?new Float32Array(position.count):undefined;const mass=isInflate?0:data.mass/100,bend=THREE.MathUtils.degToRad(data.bend),twist=THREE.MathUtils.degToRad(data.twist);
  const inflateAmplitude=Math.max(.001,data.inflateAmount/100*.72),inflateFalloff=Math.min(.48,Math.max(.07,Math.min(normalized.size.x,normalized.size.y)*scale*.2));
  for(let i=0;i<position.count;i++){
    let x=position.getX(i),y=position.getY(i),z=position.getZ(i);const xn=THREE.MathUtils.clamp((x-cx)/hx,-1,1),yn=THREE.MathUtils.clamp((y-cy)/hy,-1,1),zn=THREE.MathUtils.clamp((z-cz)/hz,-1,1),radial=Math.max(0,1-xn*xn-yn*yn);
    x=cx+(x-cx)*(1+data.bulge/100*(1-yn*yn)*.36)*(1+data.taper/100*yn*.38)*(1+mass*.08);y=cy+(y-cy)*(1+data.bulge/100*(1-xn*xn)*.18)*(1+mass*.08);
    if(Math.abs(bend)>.001)x+=Math.sin(yn*Math.PI*.5)*hx*bend*.25;
    if(Math.abs(twist)>.001){const angle=twist*yn*.34,c=Math.cos(angle),s=Math.sin(angle),dx=x-cx,dy=y-cy;x=cx+dx*c-dy*s;y=cy+dx*s+dy*c;}
    if(isInflate){
      const side=zn>=0?1:-1,field=distanceFieldToContours(x,y,deformationContours),t=THREE.MathUtils.clamp(field.distance/inflateFalloff,0,1),rounded=Math.pow(Math.sin(t*Math.PI*.5),.72);inflateDistances![i]=field.distance;
      const outward=data.inflateDirection!=="Inward",height=outward?inflateAmplitude*rounded:inflateAmplitude*(1-.94*rounded);
      z=cz+side*height;
    }else z=cz+(z-cz)*(1+mass*.18)+zn*hz*mass*radial*.48;
    position.setXYZ(i,x,y,z);
  }
  position.needsUpdate=true;if(isInflate)relaxInflateHeights(geometry,inflateDistances!);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  // A low fixed crease angle made gently curved cap triangles shade as separate
  // facets. The bevel amount now controls a broader, genuinely smooth normal
  // transition while the 90-degree non-bevel edge remains crisp.
  const creaseDegrees=data.geometryMode==="Revolve"?(data.revolveAngle<359.999?70:178):THREE.MathUtils.lerp(38,80,THREE.MathUtils.clamp(data.edge/300,0,1));
  // Three's helper groups positions on a fixed 0.01-unit grid. Dense meshes
  // can put unrelated vertices in the same cell, producing the radial bands
  // seen on complex shapes. Temporarily scaling the geometry makes that grid
  // precise to 0.00001 model units without changing the resulting normals.
  geometry.scale(1000,1000,1000);
  geometry=toCreasedNormals(geometry,THREE.MathUtils.degToRad(isInflate?179:creaseDegrees));
  geometry.scale(.001,.001,.001);
  const p=(geometry.attributes.position.array as Float32Array),n=(geometry.attributes.normal.array as Float32Array),uv=geometry.attributes.uv?(geometry.attributes.uv.array as Float32Array):new Float32Array();return {id:data.id,position:p,normal:n,uv,triangles:p.length/9};
}

const workerScope=self as unknown as DedicatedWorkerGlobalScope;
workerScope.onmessage=(event:MessageEvent<GeometryRequest>)=>{try{const result=build(event.data);workerScope.postMessage(result,[result.position.buffer,result.normal.buffer,result.uv.buffer]);}catch(error){workerScope.postMessage({id:event.data.id,error:error instanceof Error?error.message:"Geometry error"});}};

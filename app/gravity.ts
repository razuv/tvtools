import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { Body, Box, ConvexPolyhedron, GSSolver, Plane, Spring, Vec3, World } from "cannon-es";

function collider(geometry:THREE.BufferGeometry) {
  const positions=geometry.getAttribute("position"),points:THREE.Vector3[]=[];
  // shortcut: a convex envelope approximates cavities; use convex decomposition for concave contact.
  const unique=new Set<string>();
  for(let i=0;i<positions.count;i++){
    const point=new THREE.Vector3().fromBufferAttribute(positions,i),key=point.toArray().join(",");
    if(!unique.has(key)){unique.add(key);points.push(point);}
  }
  const hull=new ConvexGeometry(points),attribute=hull.getAttribute("position");
  const vertices:Vec3[]=[],faces:number[][]=[],indices=new Map<string,number>();
  for(let i=0;i<attribute.count;i+=3){
    const face:number[]=[];
    for(let j=0;j<3;j++){
      const point=new THREE.Vector3().fromBufferAttribute(attribute,i+j),key=point.toArray().map(value=>value.toFixed(6)).join(",");
      let index=indices.get(key);if(index===undefined){index=vertices.length;indices.set(key,index);vertices.push(new Vec3(point.x,point.y,point.z));}face.push(index);
    }
    if(new Set(face).size===3)faces.push(face);
  }
  hull.dispose();
  if(vertices.length>=4&&faces.length>=4)return new ConvexPolyhedron({vertices,faces});
  geometry.computeBoundingBox();const size=geometry.boundingBox!.getSize(new THREE.Vector3()).multiplyScalar(.5);
  return new Box(new Vec3(Math.max(size.x,.01),Math.max(size.y,.01),Math.max(size.z,.01)));
}

export class ModelPhysics {
  readonly world=new World({gravity:new Vec3(0,-9.8,0),allowSleep:true});
  readonly body:Body;
  private readonly anchor=new Body({type:Body.KINEMATIC,collisionFilterGroup:0,collisionFilterMask:0});
  private spring:Spring|null=null;
  private elapsed=0;

  readonly geometry:THREE.BufferGeometry;
  private readonly model:THREE.Object3D;
  private readonly floorY:number;
  constructor(geometry:THREE.BufferGeometry,model:THREE.Object3D,floorY:number) {
    this.geometry=geometry;this.model=model;this.floorY=floorY;
    (this.world.solver as GSSolver).iterations=16;
    this.world.defaultContactMaterial.friction=.55;this.world.defaultContactMaterial.restitution=.28;
    const floor=new Body({mass:0,shape:new Plane()});floor.position.y=floorY;floor.quaternion.setFromEuler(-Math.PI/2,0,0);this.world.addBody(floor);
    this.body=new Body({mass:1,shape:collider(geometry),linearDamping:.12,angularDamping:.25,allowSleep:true,sleepSpeedLimit:.08,sleepTimeLimit:1});
    this.body.position.set(model.position.x,model.position.y,model.position.z);this.body.quaternion.set(model.quaternion.x,model.quaternion.y,model.quaternion.z,model.quaternion.w);this.world.addBody(this.body);this.world.addBody(this.anchor);
  }
  get dragging(){return this.spring!==null;}
  grab(point:THREE.Vector3) {
    this.anchor.position.set(point.x,point.y,point.z);
    this.spring=new Spring(this.body,this.anchor,{localAnchorA:this.body.pointToLocalFrame(new Vec3(point.x,point.y,point.z)),localAnchorB:new Vec3(),restLength:0,stiffness:95,damping:9});
    this.body.wakeUp();
  }
  dragTo(point:THREE.Vector3){if(this.spring){this.anchor.position.set(point.x,point.y,point.z);this.body.wakeUp();}}
  release(){this.spring=null;}
  step(elapsed:number) {
    if(!Number.isFinite(elapsed)||elapsed<=0)return;
    this.elapsed+=Math.min(elapsed,.05);
    while(this.elapsed>=1/120){
      this.spring?.applyForce();
      const speed=this.body.velocity.length();if(speed>15)this.body.velocity.scale(15/speed,this.body.velocity);
      const spin=this.body.angularVelocity.length();if(spin>20)this.body.angularVelocity.scale(20/spin,this.body.angularVelocity);
      this.world.step(1/120);this.elapsed-=1/120;
    }
    this.model.position.copy(this.body.position);this.model.quaternion.copy(this.body.quaternion);
    // Keep solver contact penetration out of the rendered pose without cancelling collision impulses.
    this.body.updateAABB();
    this.model.position.y+=Math.max(0,this.floorY-this.body.aabb.lowerBound.y);
  }
}

import * as THREE from "three";

// shortcut: floor contact uses mesh bounds; use rigid-body collisions if tumbling is needed.
export function stepGravity(position:THREE.Vector3,velocity:THREE.Vector3,target:THREE.Vector3|null,floorY:number,elapsed:number) {
  const steps=Math.max(1,Math.ceil(Math.min(Math.max(elapsed,0),.05)*120));
  const dt=Math.min(Math.max(elapsed,0),.05)/steps;
  for(let i=0;i<steps;i++) {
    if(target) {
      velocity.x+=((target.x-position.x)*60-velocity.x*12)*dt;
      velocity.y+=((target.y-position.y)*60-velocity.y*12)*dt;
      velocity.z+=((target.z-position.z)*60-velocity.z*12)*dt;
    } else {
      velocity.y-=9.8*dt;
      velocity.x*=Math.exp(-2*dt);velocity.z*=Math.exp(-2*dt);
    }
    velocity.clampLength(0,15);position.addScaledVector(velocity,dt);
    if(position.y<floorY){position.y=floorY;if(velocity.y<0)velocity.y=Math.abs(velocity.y)<.5?0:-velocity.y*.18;velocity.x*=Math.exp(-6*dt);velocity.z*=Math.exp(-6*dt);}
  }
}

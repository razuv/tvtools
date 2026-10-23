import * as THREE from "three";

export function getCameraView(camera:THREE.PerspectiveCamera,target:THREE.Vector3) {
  const lensScale=Math.tan(THREE.MathUtils.degToRad(18))/Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  return {zoom:Math.round(5.4*lensScale/camera.position.distanceTo(target)*100)/100,focalLength:Math.round(camera.getFocalLength())};
}

export function setCameraView(camera:THREE.PerspectiveCamera,target:THREE.Vector3,kind:"zoom"|"focalLength",value:number) {
  if(!Number.isFinite(value)) return;
  if(kind==="zoom") {
    const lensScale=Math.tan(THREE.MathUtils.degToRad(18))/Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    camera.position.sub(target).setLength(5.4*lensScale/THREE.MathUtils.clamp(value,5.4/24,5.4/.7)).add(target);
  } else {
    const oldFocalLength=camera.getFocalLength();
    camera.setFocalLength(THREE.MathUtils.clamp(value,10,200));
    // Dolly with the lens to keep framing steady while perspective changes.
    camera.position.sub(target).multiplyScalar(camera.getFocalLength()/oldFocalLength).add(target);
  }
  camera.updateProjectionMatrix();
}

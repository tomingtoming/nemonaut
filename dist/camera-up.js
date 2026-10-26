import {Vector3,Quaternion} from 'three';
const worldUp=new Vector3(0,1,0);

// Three r180 caches this frame at construction. Keep it synchronized with the
// local vertical so orbit/pan input and camera.lookAt use the same up direction.
export function setOrbitUp(controls,up){
 controls.object.up.copy(up);
 controls._quat.setFromUnitVectors(controls.object.up,worldUp);
 controls._quatInverse.copy(controls._quat).invert();
}

export function frameTrackedVessel(controls,focus,up){
 setOrbitUp(controls,up);
 controls.target.copy(focus);
 const offset=new Vector3(14,10,18).applyQuaternion(new Quaternion().setFromUnitVectors(worldUp,up));
 controls.object.position.copy(focus).add(offset);
 controls.update();
}

// Apply after OrbitControls, including its damping. Do not move the focus or
// the vessel. Water mode deliberately permits the camera below sea level.
export function constrainSurfaceCamera(controls,center,radius){
 const camera=controls.object,radial=camera.position.clone().sub(center);
 const minimum=radius+Math.max(.5,camera.near*2);
 if(radial.lengthSq()>=minimum*minimum)return false;
 if(radial.lengthSq()<1e-12)radial.copy(camera.up);
 camera.position.copy(center).add(radial.setLength(minimum));
 camera.lookAt(controls.target);
 return true;
}

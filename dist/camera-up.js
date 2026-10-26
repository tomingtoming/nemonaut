import {Vector3} from 'three';
const worldUp=new Vector3(0,1,0);

// Three r180 caches this frame at construction. Keep it synchronized with the
// local vertical so orbit/pan input and camera.lookAt use the same up direction.
export function setOrbitUp(controls,up){
 controls.object.up.copy(up);
 controls._quat.setFromUnitVectors(controls.object.up,worldUp);
 controls._quatInverse.copy(controls._quat).invert();
}

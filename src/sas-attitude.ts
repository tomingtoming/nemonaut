import * as T from 'three';

// A banked aircraft turns around the local vertical. Transport the held
// orientation with that heading change, keeping its pitch and bank intact.
export function followBankHeading(current,target,up){
 const forward=new T.Vector3(0,0,1).applyQuaternion(current);
 const wanted=new T.Vector3(0,0,1).applyQuaternion(target);
 forward.addScaledVector(up,-forward.dot(up));wanted.addScaledVector(up,-wanted.dot(up));
 if(forward.lengthSq()<.01||wanted.lengthSq()<.01)return target.clone();
 forward.normalize();wanted.normalize();
 const angle=Math.atan2(up.dot(wanted.clone().cross(forward)),wanted.dot(forward));
 return new T.Quaternion().setFromAxisAngle(up,angle).multiply(target).normalize();
}

// Release only commanded body axes. Uncommanded axes keep their attitude error.
export function manualAttitudeTarget(current,target,input){
 const error=current.clone().invert().multiply(target);
 for(const axis of ['x','y','z'])if(Math.abs(input[axis])>.01)error[axis]=0;
 return current.clone().multiply(error.normalize()).normalize();
}

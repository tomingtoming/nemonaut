import * as T from 'three';

// Release only commanded body axes. Uncommanded axes keep their attitude error.
export function manualAttitudeTarget(current,target,input){
 const error=current.clone().invert().multiply(target);
 for(const axis of ['x','y','z'])if(Math.abs(input[axis])>.01)error[axis]=0;
 return current.clone().multiply(error.normalize()).normalize();
}

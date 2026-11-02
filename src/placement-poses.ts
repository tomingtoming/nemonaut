import {PARTS,type PartCatalog} from './catalog.js';
import * as T from 'three';

// One transform source for the visible placement ghosts and committed parts.
export interface PlacementPose{pos:T.Vector3;q:T.Quaternion}
export function symmetryPlacementPoses(position:T.Vector3,rotation:T.Quaternion,mode:string,bay:string,type:string):PlacementPose[]{
 const count=mode==='mirror'?2:Number(mode);
 if(![1,2,3,4,6,8].includes(count))throw Error('対称数が不正です');
 return Array.from({length:count},(_,i)=>{
  const pos=position.clone(),q=rotation.clone();
  if(mode==='mirror'&&i){
   pos.x=-pos.x;const reflect=new T.Matrix4().makeScale(-1,1,1);
   q.setFromRotationMatrix(new T.Matrix4().makeRotationFromQuaternion(q).premultiply(reflect).multiply(reflect));
   if((PARTS as PartCatalog)[type]?.rootWing)q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI));
  }else if(i){
   const axis=bay==='vab'?new T.Vector3(0,1,0):new T.Vector3(0,0,1),turn=new T.Quaternion().setFromAxisAngle(axis,i*2*Math.PI/count);
   pos.applyQuaternion(turn);q.premultiply(turn);
  }
  return {pos,q};
 });
}

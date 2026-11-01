import * as T from 'three';
import {PARTS} from './catalog.js';
import {partRotation} from './aero.js';
import {centerOfVessel} from './relative-navigation.js';
export function portPose(v,id){const p=v.parts.find(p=>p.id===id);if(!p||!PARTS[p.type].docking)return null;const q=v.q.clone().multiply(partRotation(p)),position=new T.Vector3(0,PARTS[p.type].dockFace,0).applyQuaternion(q).add(new T.Vector3(...p.p).applyQuaternion(v.q)).add(v.pos),normal=new T.Vector3(0,1,0).applyQuaternion(q),velocity=v.vel.clone().add(v.omega.clone().cross(position.clone().sub(centerOfVessel(v))));return {part:p,q,position,normal,velocity};}
export function portGuidance(a,aId,b,bId){
 if(!b||a===b)return null;const own=portPose(a,aId),target=portPose(b,bId);if(!own||!target||own.part.dockPartner||target.part.dockPartner)return null;
 const right=new T.Vector3(1,0,0).applyQuaternion(target.q),top=new T.Vector3(0,0,1).applyQuaternion(target.q),outward=target.normal,offset=own.position.clone().sub(target.position),velocity=own.velocity.clone().sub(target.velocity),rotatingVelocity=velocity.clone().sub(b.omega.clone().cross(offset));
 return {own,target,right,top,outward,axial:offset.dot(outward),horizontal:offset.dot(right),vertical:offset.dot(top),lateral:Math.hypot(offset.dot(right),offset.dot(top)),closing:-rotatingVelocity.dot(outward),horizontalSpeed:rotatingVelocity.dot(right),verticalSpeed:rotatingVelocity.dot(top),speed:velocity.length(),angle:Math.acos(T.MathUtils.clamp(-own.normal.dot(outward),-1,1)),desiredNormal:outward.clone().negate()};
}
// Manual axes: positive forward approaches the face; x/y slide on its plane.
export function portTranslation(guidance,q,{forward=0,right=0,up=0}){if(!guidance)return new T.Vector3();return guidance.outward.clone().multiplyScalar(-forward).addScaledVector(guidance.right,right).addScaledVector(guidance.top,up).applyQuaternion(q.clone().invert());}

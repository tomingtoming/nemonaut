import * as T from 'three';
import {PARTS} from './catalog.js';
import {partCenter,partRotation} from './aero.js';
import {bodyAltitude,bodyUp,relativeMotion} from './celestial.js';
import {surfaceAngularVelocity,surfaceVelocity} from './surface-frame.js';

export const PHYSICS_MODEL='rotating-primary-v1';
export function needsPhysicsMigration(record){return !!record&&(record.physicsModel===undefined||(record.detached||[]).some(needsPhysicsMigration));}

// Only call on a validated, independently loaded Flight after shared UT is
// resolved. Preserve saved positions and inertial trajectories in space.
export function migrateLegacySurface(v){
 const com=v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q)),motion=relativeMotion(com,v.vel,v.universalTime);
 if(motion.body.id!=='planet')return false;
 const touching=v.parts.some(p=>{
  const point=partCenter(p).applyQuaternion(v.q).add(v.pos),up=bodyUp(point,v.universalTime,motion.body),q=v.q.clone().multiply(partRotation(p)),size=PARTS[p.type].size;
  const extent=[[1,0,0],[0,1,0],[0,0,1]].reduce((sum,axis,i)=>sum+Math.abs(new T.Vector3(...axis).applyQuaternion(q).dot(up))*size[i]/2,0);
  const height=bodyAltitude(point,v.universalTime,motion.body);
  return height-extent<.5&&height+extent>-.5;
 });
 if(!touching||motion.velocity.length()>=.8||v.omega.length()>=.15)return false;
 v.vel.add(surfaceVelocity(com,v.universalTime,motion.body).sub(motion.bodyVelocity));
 v.omega.add(surfaceAngularVelocity(motion.body));return true;
}
export function physicsMigrationMessage(summary){
 if(!summary)return '';
 return '自転対応へ保存を移行済み：地表で静止していた '+summary.surface+' 機は地表相対速度を維持、その他 '+summary.inertial+' 機は位置・慣性速度を維持しました。大気は地表と共に回転します。';
}

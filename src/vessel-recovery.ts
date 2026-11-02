import {surfaceRelativeVelocity,surfaceAngularVelocity} from './surface-frame.js';
import * as T from 'three';
import {loadFlight,saveFlight,type SavedFlight} from './flight-save.js';
import {fleet,canControl} from './fleet.js';
import {resolveTargets} from './relative-navigation.js';
import {partCenter,partRotation} from './aero.js';
import {bodyAltitude,bodyUp,relativeMotion} from './celestial.js';
import {PARTS,type PartCatalog} from './catalog.js';

export type RecoveryVessel=Pick<import('./core.js').Flight,'pos'|'vel'|'universalTime'|'stats'|'q'|'omega'|'throttle'|'environment'|'parts'|'crashed'|'time'|'landed'>;
export interface RecoveryStatus{recoverable:boolean;bodyId:string;action:string;reason:string}
export function recoveryStatus(v:RecoveryVessel):RecoveryStatus{
 const motion=relativeMotion(v.pos,v.vel,v.universalTime),quiet=surfaceRelativeVelocity(v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q)),v.vel,v.universalTime,motion.body).length()<.8&&v.omega.clone().sub(surfaceAngularVelocity(motion.body)).length()<.15&&v.throttle===0;
 const afloat=v.environment==='water'&&motion.body.id==='planet'&&v.parts.some(p=>{
  const center=partCenter(p).applyQuaternion(v.q).add(v.pos),normal=bodyUp(center,v.universalTime),q=v.q.clone().multiply(partRotation(p)),size=(PARTS as PartCatalog)[p.type].size;
  const extent=[[1,0,0],[0,1,0],[0,0,1]].reduce((sum,axis,i)=>sum+Math.abs(new T.Vector3(...axis).applyQuaternion(q).dot(normal))*size[i]/2,0);
  return Math.abs(bodyAltitude(center,v.universalTime))<=extent+.1;
 });
 const recoverable=!v.crashed&&quiet&&v.time>.5&&(v.landed||afloat);
 return {recoverable,bodyId:motion.body.id,action:recoverable?'回収':'運用終了',reason:v.crashed?'機体損傷':recoverable?(v.environment==='water'?'着水・静止':'着地・静止'):'飛行中または移動中'};
}

// Work on an independent copy: rejection never mutates the caller's world.
export interface RetiredVessel{record:SavedFlight|null;removed:{name:string;parts:number;bodyId:string;action:string}}
export function retireVessel(record:SavedFlight,partId:string,mode:string):RetiredVessel{
 const root=loadFlight(record);let vessels:import('./core.js').Flight[]=[];
 try{
  vessels=fleet(root);const target=vessels.find(v=>v.parts.some(p=>p.id===partId));
  if(!target)throw Error('対象の機体が見つかりません');
  if(!['recover','terminate'].includes(mode))throw Error('運用終了の操作が不正です');
  const status=recoveryStatus(target);
  if(mode==='recover'&&!status.recoverable)throw Error('回収には損傷のない着地・着水状態と停止が必要です');
  const remaining=vessels.filter(v=>v!==target),next=remaining.includes(root)?root:remaining.find(canControl)||remaining[0];
  for(const v of vessels)v.detached=[];
  if(next){next.detached=remaining.filter(v=>v!==next);resolveTargets(next);}
  const result=next?saveFlight(next,{...record.meta,name:next.vesselName||record.meta?.name,pilot:null}):null;
  return {record:result,removed:{name:target.vesselName||'機体',parts:target.parts.length,bodyId:status.bodyId,action:mode==='recover'?'回収':'運用終了'}};
 }finally{
  // Dispose each physics world exactly once after detaching the ownership tree.
  if(vessels.length){for(const v of vessels)v.detached=[];for(const v of vessels)v.dispose();}else root.dispose();
 }
}

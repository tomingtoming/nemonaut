import * as T from 'three';
import {DELIVERY_SITE,deliveryDistance} from './delivery-sites.js';
import {surfaceRelativeVelocity} from './surface-frame.js';
import {descentTelemetry} from './descent.js';
export const OBSERVATION_POWER=.1;
export function createObservations(parts){return new Map(parts.filter(p=>p.type==='probe').map(p=>[p.id,{enabled:false,day:0,night:0}]));}
export function observationDemand(v,states=v.observations){return v.crashed?0:[...states].filter(([id,s])=>s.enabled&&!v.thermal.get(id)?.failed).length*OBSERVATION_POWER;}
export function observationReason(v,id){
 const p=v.parts.find(p=>p.id===id),s=v.observations.get(id);
 if(!p||!s)return '観測装置なし';
 if(v.crashed||v.thermal.get(id)?.failed)return '機体損傷';
 if(!s.enabled)return '停止中';
 const point=new T.Vector3(...p.p).applyQuaternion(v.q).add(v.pos),com=v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q));
 if(deliveryDistance(point,v.universalTime)>DELIVERY_SITE.radius)return '北観測点の範囲外';
 if(!v.landed||surfaceRelativeVelocity(com,v.vel,v.universalTime).length()>=.5)return '接地・静止待ち';
 const d=descentTelemetry(v);if(d.body!=='planet'||Math.abs(d.clearance)>.5)return '接地・静止待ち';
 return '';
}
export function advanceObservations(v,states,power,dt){
 for(const [id,s]of states){if(!s.enabled||observationReason({...v,observations:states},id))continue;
  const key=power.eclipse?'night':'day';s[key]=Math.min(1e12,s[key]+dt*power.ratio);
 }
}

import * as T from 'three';
import {DELIVERY_SITE,DELIVERY_SITES,deliveryDistance,type DeliverySite} from './delivery-sites.js';
import {surfaceRelativeVelocity} from './surface-frame.js';
import {descentTelemetry,type DescentVessel} from './descent.js';
export const OBSERVATION_POWER=.1;
/** Accumulated observation seconds (and their quality) at one delivery site. */
export interface ObservationRecord{day:number;night:number;quality?:Record<import('./observation-quality.js').ObservationPeriod,import('./observation-quality.js').ObservationInterval>}
/** Per-probe observation state; the default site lives on the record itself, others under sites. */
export interface ObservationState extends ObservationRecord{enabled:boolean;sites?:Record<string,ObservationRecord>}
export type ObservationMap=Map<string,ObservationState>;
/** The vessel fields observationDemand reads. */
export interface ObservationDemandVessel{crashed?:boolean;thermal:ReadonlyMap<string,{failed:boolean}>;observations:ReadonlyMap<string,ObservationState>}
/** The vessel fields observationSite reads. */
export interface ObservationSiteVessel{parts:readonly Pick<import('./catalog.js').Part,'id'|'p'>[];q:T.Quaternion;pos:T.Vector3;universalTime:number}
/** The vessel fields observationReason and advanceObservations read. */
export interface ObservationVessel extends DescentVessel,ObservationDemandVessel{crashed?:boolean;landed?:boolean}
/** The vessel (live or saved world record) fields observationStatus reads. */
export interface ObservationStatusVessel extends Omit<ObservationVessel,'thermal'|'observations'>{state?:{crashed?:boolean};thermal:Iterable<readonly [string,{failed:boolean}]>;observations?:Iterable<readonly [string,ObservationState]>|null;telemetry:{power?:Pick<import('./power.js').PowerReading,'ratio'|'eclipse'>|null}}
export function createObservations(parts:readonly Pick<import('./catalog.js').Part,'id'|'type'>[]):ObservationMap{return new Map<string,ObservationState>(parts.filter(p=>p.type==='probe').map(p=>[p.id,{enabled:false,day:0,night:0}]));}
export function observationDemand(v:ObservationDemandVessel,states:ReadonlyMap<string,ObservationState>=v.observations):number{return v.crashed?0:[...states].filter(([id,s])=>s.enabled&&!v.thermal.get(id)?.failed).length*OBSERVATION_POWER;}
export function observationSite(v:ObservationSiteVessel,id:string):DeliverySite|null{const p=v.parts.find(p=>p.id===id);if(!p)return null;const point=new T.Vector3(...p.p).applyQuaternion(v.q).add(v.pos);return DELIVERY_SITES.find(site=>deliveryDistance(point,v.universalTime,site)<=site.radius)??null;}
export function observationData(state:ObservationState|undefined,site?:DeliverySite):ObservationRecord|undefined;
/** For untyped callers that copy a saved observation map (new Map(any)); remove once they pass a typed ObservationMap. */
export function observationData(state:unknown,site?:DeliverySite):ObservationRecord|undefined;
export function observationData(state:unknown,site:DeliverySite=DELIVERY_SITE):ObservationRecord|undefined{return site.id===DELIVERY_SITE.id?state as ObservationState|undefined:(state as ObservationState|undefined)?.sites?.[site.id]??{day:0,night:0};}
export function observationReason(v:ObservationVessel,id:string):string{
 const p=v.parts.find(p=>p.id===id),s=v.observations.get(id);
 if(!p||!s)return '観測装置なし';
 if(v.crashed||v.thermal.get(id)?.failed)return '機体損傷';
 if(!s.enabled)return '停止中';
 const com=v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q));
 if(!observationSite(v,id))return '観測点の範囲外';
 if(!v.landed||surfaceRelativeVelocity(com,v.vel,v.universalTime).length()>=.5)return '接地・静止待ち';
 const d=descentTelemetry(v);if(d.body!=='planet'||Math.abs(d.clearance)>.5)return '接地・静止待ち';
 return '';
}
export function advanceObservations(v:ObservationVessel,states:Map<string,ObservationState>,power:Pick<import('./power.js').PowerReading,'ratio'|'eclipse'>,dt:number):void{
 for(const [id,s]of states){if(!s.enabled||observationReason({...v,observations:states},id))continue;
  const site=observationSite(v,id);if(!site)continue;
  const data=site.id===DELIVERY_SITE.id?s:((s.sites??={})[site.id]??={day:0,night:0});
  const key=power.eclipse?'night':'day';data[key]=Math.min(1e12,data[key]+dt*power.ratio);
  const quality=data.quality??={day:{received:0,missed:0},night:{received:0,missed:0}};quality[key].received=Math.min(1e12,quality[key].received+dt*power.ratio);quality[key].missed=Math.min(1e12,quality[key].missed+dt*(1-power.ratio));
 }
}

export function observationStatus(v:ObservationStatusVessel,id:string,{paused=false}:{paused?:boolean}={}):string{
 const state=v.state??v,thermal=new Map<string,{failed:boolean}>(v.thermal),observation=new Map<string,ObservationState>(v.observations??[]).get(id);
 if(state.crashed||thermal.get(id)?.failed)return '機体損傷';
 if(!observation)return '観測装置なし';
 if(!observation.enabled)return '停止中';
 if(paused)return '観測ON · 時間停止中';
 const reason=observationReason(v as ObservationStatusVessel&ObservationVessel,id);if(reason)return reason;
 const power=v.telemetry.power;if(!power)return '給電確認中';
 if(power.ratio<=0)return '電力不足 · 観測停止';
 const period=power.eclipse?'夜間':'日照';
 return power.ratio<.999?'電力不足 · '+period+' '+Math.round(power.ratio*100)+'%で観測':period+'を観測中';
}

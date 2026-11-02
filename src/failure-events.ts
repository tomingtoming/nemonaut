import {PARTS,type PartType} from './catalog.js';
type Vector3=import('three').Vector3;
export type FailureCause='impact'|'thermal'|'structural';
export type FailureEffect='fuel-burst'|'fragments';
export interface FailureEvent{id:string;partId:string;type:PartType;cause:FailureCause;time:number;position:number[];velocity:number[];speed:number;fuel:number;temperature:number;effect:FailureEffect}
export interface FailureRecorder{failureEvents?:FailureEvent[];fuel:ReadonlyMap<string,number>;thermal:ReadonlyMap<string,{temperature?:number}>;universalTime:number;pos:Vector3;vel:Vector3}

export const FAILURE_EVENT_LIMIT=64;
export function failureCaption(e:Pick<FailureEvent,'type'|'cause'|'effect'>):string{return (PARTS[e.type]?.code??e.type)+' · '+({impact:'衝突で破損',thermal:'熱損傷',structural:'荷重で破断'}[e.cause]??'破損')+(e.effect==='fuel-burst'?' · 推進剤破裂':'');}
// History is simulation data. Rendering must never invent a failure or consume fuel.
export function recordFailure(f:FailureRecorder,part:{id:string;type:PartType}|null|undefined,cause:FailureCause,{speed=0,position}:{speed?:number,position?:Vector3|null}={}):FailureEvent|null{
 if(!part||!['impact','thermal','structural'].includes(cause))throw Error('Invalid failure cause');
 f.failureEvents??=[];
 if(f.failureEvents.some(e=>e.partId===part.id))return null;
 const d=PARTS[part.type],fuel=Math.max(0,f.fuel.get(part.id)||0);
 const event:FailureEvent={id:crypto.randomUUID(),partId:part.id,type:part.type,cause,time:f.universalTime,
  position:position?.toArray()??f.pos.toArray(),velocity:f.vel.toArray(),speed:Math.max(0,speed),
  fuel,temperature:f.thermal.get(part.id)?.temperature??288.15,
  effect:fuel>0&&(d.fuel||d.monoprop)?'fuel-burst':'fragments'};
 f.failureEvents.push(event);if(f.failureEvents.length>FAILURE_EVENT_LIMIT)f.failureEvents.shift();
 return event;
}
export function validateFailureEvents(value:unknown):FailureEvent[]{
 if(value===undefined)return [];
 const fail=()=>{throw Error('破損履歴が不正です');},ids=new Set<string>();
 if(!Array.isArray(value)||value.length>FAILURE_EVENT_LIMIT)fail();
 let last=-1;
 for(const e of value as FailureEvent[]){
  if(!e||typeof e.id!=='string'||!e.id.length||e.id.length>200||ids.has(e.id)||typeof e.partId!=='string'||!e.partId.length||e.partId.length>200||!Object.hasOwn(PARTS,e.type)||!['impact','thermal','structural'].includes(e.cause))fail();
  ids.add(e.id);
  if(!(['time','speed','fuel','temperature'] as ('time'|'speed'|'fuel'|'temperature')[]).every(k=>Number.isFinite(e[k])&&e[k]>=0&&e[k]<=1e12)||e.time<last)fail();last=e.time;
  for(const k of ['position','velocity'] as ('position'|'velocity')[])if(!Array.isArray(e[k])||e[k].length!==3||e[k].some(n=>!Number.isFinite(n)||Math.abs(n)>1e12))fail();
  const d=PARTS[e.type];if(e.fuel>(d.fuel||d.monoprop||0)||e.effect!==(e.fuel>0&&(d.fuel||d.monoprop)?'fuel-burst':'fragments'))fail();
 }
 return structuredClone(value as FailureEvent[]);
}

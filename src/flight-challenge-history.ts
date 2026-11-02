import {deliverySite} from './delivery-sites.js';
export const PRECISION_ALTITUDE=100;
/** A flight-ascent / flight-touchdown / precision-landing history record, with the fields validateFlightChallenge checks (untrusted until validated). */
export interface FlightChallengeEvent{id:string;type:string;partIds:string[];launchEventIds?:unknown;flightEventIds?:unknown;siteId?:unknown;clearance:number;distance:number;speed:number;damaged?:boolean;probePartId?:unknown;[key:string]:unknown}
/** Latest ascent/touchdown record by part id. */
export type FlightPhases=Map<string,FlightChallengeEvent>;
export const flightChallengeTypes=['flight-ascent','flight-touchdown','precision-landing'];
export function flightPhases<E extends {type:string;partIds?:readonly string[]}>(history:readonly E[]):Map<string,E>{const phases=new Map<string,E>();for(const e of history)if(e.type==='flight-ascent'||e.type==='flight-touchdown'){const ids:readonly string[]|undefined=e.partIds;if(!ids)throw Error('飛行課題の記録に部品がありません');for(const id of ids)phases.set(id,e);}return phases;}
export function phaseSources<E extends {type:string}>(partIds:readonly string[],phases:ReadonlyMap<string,E>,type:string):E[]|null{const events=partIds.map(id=>phases.get(id));return events.length&&events.every((e):e is E=>e?.type===type)?[...new Set<E>(events)]:null;}
export function validateFlightChallenge(event:FlightChallengeEvent,phases:FlightPhases,completed:Set<unknown>,sources:readonly unknown[]|null|undefined):void{
 const same=(a:unknown,b:readonly unknown[]):boolean=>Array.isArray(a)&&JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
 const ids=event.partIds;
 const forbidden=event.type==='flight-ascent'?['siteId','distance','speed','damaged','flightEventIds','probePartId']:event.type==='flight-touchdown'?['clearance','speed','probePartId']:['clearance','probePartId'];
 if(forbidden.some(k=>event[k]!==undefined))throw Error('飛行課題の証拠の項目が不正です');
 if(!ids||!sources||!same(event.launchEventIds,sources))throw Error('着陸課題の通常出発履歴が不正です');
 if(event.type==='flight-ascent'){
  if(!Number.isFinite(event.clearance)||event.clearance<PRECISION_ALTITUDE||event.clearance>1e12||phaseSources(ids,phases,'flight-ascent'))throw Error('上昇記録の高度・重複が不正です');
 }else{
  const from=phaseSources(ids,phases,event.type==='flight-touchdown'?'flight-ascent':'flight-touchdown');
  if(!from||!same(event.flightEventIds,from.map(e=>e.id))||!deliverySite(event.siteId)||!Number.isFinite(event.distance)||event.distance<0||event.distance>2e6||typeof event.damaged!=='boolean')throw Error('接地記録の飛行元・地点・距離が不正です');
  if(event.type==='precision-landing'){
   const site=deliverySite(event.siteId);if(!site)throw Error('接地記録の飛行元・地点・距離が不正です');
   if(completed.has(site.id)||event.damaged||event.distance>site.radius||!Number.isFinite(event.speed)||event.speed<0||event.speed>=.5||from.some(e=>e.siteId!==site.id||e.distance>site.radius||e.damaged))throw Error('精密着陸の接地位置・損傷・速度・重複が不正です');
   completed.add(site.id);
  }
 }
 if(event.type!=='precision-landing')for(const id of ids)phases.set(id,event);
}

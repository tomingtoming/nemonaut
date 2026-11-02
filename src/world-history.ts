import {flightChallengeTypes,validateFlightChallenge,type FlightChallengeEvent} from './flight-challenge-history.js';
import {copyObservationQuality,type ObservationQuality} from './observation-quality.js';
import {deliverySite,SURVEY_TARGET_SECONDS} from './delivery-sites.js';
import {departureMode} from './departure-mode.js';
import {PLANET} from './planet.js';
import {surfaceOrigins,orbitalOrigins,orbitalReturnSources,type ProvenanceEvent} from './launch-provenance.js';
const types=new Set<string>(['launch','recover','terminate','orbit','moon-arrival','moon-landing','delivery','survey',...flightChallengeTypes]);
export interface HistoryOrbit{bodyId:string;periapsis:number;apoapsis:number}
// A stored, validated history event. Fits CenterHistoryEvent, ProvenanceEvent, DeliveryRecord and HistoryLabelEvent.
export interface WorldHistoryEvent extends ProvenanceEvent{id:string;type:string;vesselId:string;name:string;universalTime:number;missionTime:number;parts:number;environment?:string;partIds?:string[];launchEventIds?:string[];bodyId?:string;orbit?:HistoryOrbit;orbitEventIds?:string[];moonEventIds?:string[];siteId?:string;probePartId?:string;distance?:number;speed?:number;deliveryEventId?:string;day?:number;night?:number;quality?:ObservationQuality;clearance?:number;flightEventIds?:string[];damaged?:boolean}
// The shape an untrusted saved event claims to have; validateHistory checks every field at runtime.
interface UncheckedHistoryEvent extends FlightChallengeEvent{vesselId:string;name:string;universalTime:number;missionTime:number;parts:number;environment?:string;bodyId?:string;orbit?:{bodyId:unknown;periapsis:number;apoapsis:number};orbitEventIds?:unknown;moonEventIds?:unknown;deliveryEventId?:unknown;day:number;night:number;quality?:ObservationQuality|null}
export interface HistoryWorld{history:readonly WorldHistoryEvent[];universalTime:number}
export interface HistoryVessel{vesselId:string;vesselName?:string|null;state:{time:number};parts:readonly {id:string}[];environment?:string}
export interface HistoryAppendOptions{orbit?:HistoryOrbit;launchEventIds?:string[];bodyId?:string;delivery?:Partial<WorldHistoryEvent>;survey?:Partial<WorldHistoryEvent>;challenge?:Partial<WorldHistoryEvent>}
// The per-event identity, order and size checks of validateHistory; the rest of the event is checked field by field there.
function isHistoryRecord(event:unknown,ids:ReadonlySet<string>,previous:number,time:number):event is UncheckedHistoryEvent{
 return typeof event==='object'&&event!==null&&'id' in event&&typeof event.id==='string'&&!!event.id.length&&!(event.id.length>256)&&!ids.has(event.id)&&'type' in event&&typeof event.type==='string'&&types.has(event.type)&&'vesselId' in event&&typeof event.vesselId==='string'&&!!event.vesselId.length&&!(event.vesselId.length>256)&&'name' in event&&typeof event.name==='string'&&!(event.name.length>80)&&'universalTime' in event&&typeof event.universalTime==='number'&&Number.isFinite(event.universalTime)&&!(event.universalTime<previous)&&!(event.universalTime>time)&&'missionTime' in event&&typeof event.missionTime==='number'&&Number.isFinite(event.missionTime)&&!(event.missionTime<0)&&!(event.missionTime>1e12)&&'parts' in event&&typeof event.parts==='number'&&Number.isInteger(event.parts)&&!(event.parts<1)&&!(event.parts>400);
}
export function validateHistory(value:unknown=[],time:number):WorldHistoryEvent[]{
 if(!Array.isArray(value)||value.length>10000)throw Error('運用記録の形式または件数が不正です');
 const phases=new Map<string,FlightChallengeEvent>(),precisionCompleted=new Set<unknown>();
 const deliveries=new Set<unknown>(),deliveryEvents=new Map<unknown,UncheckedHistoryEvent>(),surveys=new Set<unknown>();
 const ids=new Set<string>(),surfaceLaunches=new Set<string>(),orbits=new Set<string>(),origins=new Map<string,UncheckedHistoryEvent>(),orbitalParts=new Map<string,string>(),lunarEvents=new Set<string>(),arrivedParts=new Set<string>(),lunarParts=new Map<string,string>();let previous=0;
 const events:readonly unknown[]=value;for(const event of events){
  if(!isHistoryRecord(event,ids,previous,time))throw Error('運用記録の値・順序・IDが不正です');
  if(event.environment!==undefined){if(event.type!=='launch')throw Error('開始条件は出発記録にのみ保存できます');departureMode(event.environment);}
  if(event.type==='launch'&&event.environment!==undefined&&departureMode(event.environment).mode==='surface')surfaceLaunches.add(event.vesselId);
  if(event.partIds!==undefined){
   if(!['launch','orbit','recover','moon-arrival','moon-landing','delivery','survey',...flightChallengeTypes].includes(event.type)||!Array.isArray(event.partIds)||event.partIds.length!==event.parts||new Set(event.partIds).size!==event.parts||event.partIds.some(id=>typeof id!=='string'||!id.length||id.length>200))throw Error('運用記録の部品IDが不正です');
   if(event.type==='launch')for(const id of event.partIds){if(origins.has(id))throw Error('部品の出発元が重複しています');origins.set(id,event);}
  }
  const lunar=['moon-arrival','moon-landing'].includes(event.type);
  if(event.type!=='orbit'&&!lunar&&event.type!=='delivery'&&!flightChallengeTypes.includes(event.type)&&event.launchEventIds!==undefined)throw Error('出発元の参照は探査記録にのみ保存できます');
  if(lunar){
   const sources=event.partIds&&surfaceOrigins(event.partIds,origins),key=event.type+':'+event.vesselId;
   const duplicate=lunarEvents.has(key)&&(event.type==='moon-landing'||event.partIds.every(id=>arrivedParts.has(id)));
   if(!sources||!Array.isArray(event.launchEventIds)||JSON.stringify([...event.launchEventIds].sort())!==JSON.stringify(sources)||event.bodyId!=='moon'||duplicate)throw Error('月探査の出発履歴・天体・重複が不正です');
   if(event.type==='moon-landing'&&event.partIds.some(id=>!arrivedParts.has(id)))throw Error('月着陸に先行する到達記録がありません');
   if(event.type==='moon-arrival')for(const id of event.partIds){arrivedParts.add(id);if(!lunarParts.has(id))lunarParts.set(id,event.id);}
   lunarEvents.add(key);
  }
  if(flightChallengeTypes.includes(event.type))validateFlightChallenge(event,phases,precisionCompleted,event.partIds&&surfaceOrigins(event.partIds,origins));
  if(!flightChallengeTypes.includes(event.type)&&['clearance','flightEventIds','damaged'].some(k=>event[k]!==undefined))throw Error('飛行課題の証拠の種類が不正です');
  if(event.type==='delivery'){
   const sources=event.partIds&&surfaceOrigins(event.partIds,origins);
   const site=deliverySite(event.siteId);if(!site||deliveries.has(event.siteId)||!sources||!Array.isArray(event.launchEventIds)||JSON.stringify([...event.launchEventIds].sort())!==JSON.stringify(sources)||typeof event.probePartId!=='string'||!event.partIds.includes(event.probePartId)||!Number.isFinite(event.distance)||event.distance<0||event.distance>site.radius||!Number.isFinite(event.speed)||event.speed<0||event.speed>=.5)throw Error('観測点設置の出発履歴・距離・速度・重複が不正です');
   deliveries.add(event.siteId);deliveryEvents.set(event.id,event);
  }else if(event.type==='survey'){
   const source=deliveryEvents.get(event.deliveryEventId);
   if(!source||event.siteId!==source.siteId||event.probePartId!==source.probePartId||typeof event.probePartId!=='string'||!event.partIds?.includes(event.probePartId)||surveys.has(event.siteId)||!(['day','night'] as const).every(k=>Number.isFinite(event[k])&&event[k]>=SURVEY_TARGET_SECONDS&&event[k]<=1e12)||event.distance!==undefined||event.speed!==undefined)throw Error('観測記録の設置元・測定時間・重複が不正です');
   copyObservationQuality(event.quality,event);surveys.add(event.siteId);
  }else if(!flightChallengeTypes.includes(event.type)&&['siteId','probePartId','distance','speed'].some(k=>event[k]!==undefined))throw Error('設置の証拠は設置記録にのみ保存できます');
  if(event.type!=='survey'&&['deliveryEventId','day','night','quality'].some(k=>event[k]!==undefined))throw Error('測定時間は観測記録にのみ保存できます');
  if(event.type==='orbit'){
   const o=event.orbit;
   let sourceProven=surfaceLaunches.has(event.vesselId);
   if(event.partIds!==undefined||event.launchEventIds!==undefined){
    const sources=event.partIds&&surfaceOrigins(event.partIds,origins);
    sourceProven=!!sources&&Array.isArray(event.launchEventIds)&&JSON.stringify([...event.launchEventIds].sort())===JSON.stringify(sources);
   }
   if(!sourceProven||orbits.has(event.vesselId)||!o||o.bodyId!=='planet'||!Number.isFinite(o.periapsis)||o.periapsis<=PLANET.atmosphereTop||!Number.isFinite(o.apoapsis)||o.apoapsis<o.periapsis)throw Error('軌道投入記録の出発履歴・軌道値・重複が不正です');
   orbits.add(event.vesselId);
   for(const id of event.partIds??[])if(!orbitalParts.has(id))orbitalParts.set(id,event.id);
  }else if(event.orbit!==undefined)throw Error('軌道値は軌道投入記録にのみ保存できます');
  if(event.bodyId!==undefined&&(!lunar&&event.type!=='recover'||!['planet','moon'].includes(event.bodyId)))throw Error('記録天体が不正です');
  if(event.orbitEventIds!==undefined){
   const sources=event.partIds&&orbitalReturnSources(event.partIds,orbitalParts);
   if(event.type!=='recover'||event.bodyId!=='planet'||!sources||!Array.isArray(event.orbitEventIds)||JSON.stringify([...event.orbitEventIds].sort())!==JSON.stringify(sources))throw Error('軌道帰還の証拠が不正です');
  }
  if(event.moonEventIds!==undefined){
   const sources=event.partIds&&orbitalReturnSources(event.partIds,lunarParts);
   if(event.type!=='recover'||event.bodyId!=='planet'||!sources||!Array.isArray(event.moonEventIds)||JSON.stringify([...event.moonEventIds].sort())!==JSON.stringify(sources))throw Error('月帰還の証拠が不正です');
  }
  ids.add(event.id);previous=event.universalTime;
 }
 return structuredClone<WorldHistoryEvent[]>(value);
}
export function appendHistory(world:HistoryWorld,type:string,vessel:HistoryVessel,{orbit,launchEventIds,bodyId,delivery,survey,challenge}:HistoryAppendOptions={}):WorldHistoryEvent[]{
 const event:WorldHistoryEvent={id:crypto.randomUUID(),type,vesselId:vessel.vesselId,name:vessel.vesselName||'名称未設定の機体',universalTime:world.universalTime,missionTime:vessel.state.time,parts:vessel.parts.length};
 if(type==='launch'){if(vessel.environment===undefined)throw Error('出発環境が不正です');departureMode(vessel.environment);event.environment=vessel.environment;event.partIds=vessel.parts.map(p=>p.id);}
 if(type==='orbit'){event.orbit=orbit;event.partIds=vessel.parts.map(p=>p.id);event.launchEventIds=launchEventIds;}
 if(['moon-arrival','moon-landing'].includes(type)){event.bodyId='moon';event.partIds=vessel.parts.map(p=>p.id);event.launchEventIds=launchEventIds;}
 if(flightChallengeTypes.includes(type)){Object.assign(event,challenge);event.partIds=vessel.parts.map(p=>p.id);event.launchEventIds=launchEventIds;}
 if(type==='delivery'){Object.assign(event,delivery);event.partIds=vessel.parts.map(p=>p.id);event.launchEventIds=launchEventIds;}
 if(type==='survey'){Object.assign(event,survey);event.partIds=vessel.parts.map(p=>p.id);}
 if(type==='recover'){
  event.partIds=vessel.parts.map(p=>p.id);event.bodyId=bodyId;
  const sources=bodyId==='planet'&&orbitalReturnSources(event.partIds,orbitalOrigins(world.history));
  if(sources)event.orbitEventIds=sources;
  const lunar=bodyId==='planet'&&orbitalReturnSources(event.partIds,orbitalOrigins(world.history,'moon-arrival'));
  if(lunar)event.moonEventIds=lunar;
 }
 return validateHistory([...world.history,event],world.universalTime);
}

import {surfaceRelativeVelocity} from './surface-frame.js';
import {pendingBurns} from './burn-schedule.js';
import {center} from './planet.js';
import {orbitSegments} from './tracking-orbits.js';
import {centerOfVessel} from './relative-navigation.js';
import {recoveryStatus} from './vessel-recovery.js';
import {PARTS,type PartCatalog} from './catalog.js';import {loadFlight,saveFlight,type SavedFlight} from './flight-save.js';import {fleet,canControl,selectVessel} from './fleet.js';
const anchor=(v:{parts:readonly {id:string;type:string}[]}):string=> (v.parts.find(p=>(PARTS as PartCatalog)[p.type].control)||v.parts[0]).id;
export interface TrackingOptions{includeOrbit?:boolean}
export type TrackingRow=ReturnType<typeof trackingList>[number];
export function trackingList(record:SavedFlight|null|undefined,{includeOrbit=false}:TrackingOptions={}){if(!record)return [];const root=loadFlight(record);try{return fleet(root).map((v,i)=>({id:anchor(v),name:(v.vesselName||record.meta?.name||'飛行')+(i===0?' / 操作中':''),bodyName:v.orbit.body.name,universalTime:v.universalTime,position:includeOrbit?centerOfVessel(v).sub(center).toArray():undefined,segments:includeOrbit?orbitSegments(centerOfVessel(v),v.vel,{stopped:v.landed||v.crashed,time:v.universalTime}):undefined,parts:v.parts.length,altitude:v.orbit.altitude,speed:v.orbit.speed,surfaceSpeed:surfaceRelativeVelocity(centerOfVessel(v),v.vel,v.universalTime).length(),time:v.time,controllable:canControl(v),pendingBurns:pendingBurns(v),recovery:recoveryStatus(v),status:v.crashed?'損傷':v.landed?'着地':v.orbit.stable?'周回軌道':'飛行中'}));}finally{root.dispose();}}
export function trackedFlight(record:SavedFlight,partId:string,observe=false):{record:SavedFlight;observe:string|null}{let root=loadFlight(record);try{const target=fleet(root).find(v=>v.parts.some(p=>p.id===partId));if(!target)throw Error('選択した機体が見つかりません');if(!observe)root=selectVessel(root,target);return {record:saveFlight(root,{...record.meta,name:root.vesselName||record.meta?.name,pilot:null}),observe:observe?partId:null};}finally{root.dispose();}}

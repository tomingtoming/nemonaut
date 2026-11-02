import {PARTS} from './catalog.js';
import {fleet,type FleetNode} from './fleet.js';
import {descentTelemetry,type DescentVessel} from './descent.js';
import {surfaceRelativeVelocity} from './surface-frame.js';
import {launchOrigins,surfaceOrigins} from './launch-provenance.js';
import {appendHistory,type WorldHistoryEvent} from './world-history.js';
import {DELIVERY_SITE,DELIVERY_SITES,deliveryDistance,type DeliverySite} from './delivery-sites.js';

export interface DeliveryVessel extends DescentVessel{crashed?:boolean;landed?:boolean;thermal:ReadonlyMap<string,import('./thermal.js').ThermalState>;charge:ReadonlyMap<string,number>}
export interface DeliveryFleetVessel extends DeliveryVessel,FleetNode<DeliveryFleetVessel>{time:number;vesselId:string;vesselName?:string|null}
export interface DeliveryTelemetry{distance:number;speed:number;ready:boolean;reason:string;probePartId:string|undefined;launchEventIds:string[]|null}

export function deliveryTelemetry(v:DeliveryVessel,history:readonly WorldHistoryEvent[],{practice=false,site=DELIVERY_SITE}:{practice?:boolean;site?:DeliverySite}={}):DeliveryTelemetry{
 const center=v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q));
 const distance=deliveryDistance(center,v.universalTime,site),speed=surfaceRelativeVelocity(center,v.vel,v.universalTime).length();
 const probe=v.parts.find(p=>p.type==='probe'),solar=v.parts.some(p=>p.type==='solar');
 const sources=surfaceOrigins(v.parts.map(p=>p.id),launchOrigins(history));
 const transport=v.parts.some(p=>PARTS[p.type].wheel||PARTS[p.type].thrust);
 let reason='';
 if(practice||!sources)reason='通常出発が必要';
 else if(v.crashed||[...v.thermal.values()].some(s=>s.failed))reason='機体損傷';
 else if(!probe||!solar)reason='探査コア・太陽電池が必要';
 else if(transport)reason='運搬機から分離';
 else if(distance>site.radius)reason='観測点へ運搬';
 else if(!v.landed||speed>=.5)reason='接地・静止待ち';
 else if((v.charge.get(probe.id)||0)<=0)reason='電力不足';
 else{const descent=descentTelemetry(v);if(descent.body!=='planet'||Math.abs(descent.clearance)>.5)reason='接地・静止待ち';}
 return {distance,speed,ready:!reason,reason,probePartId:probe?.id,launchEventIds:sources};
}
export function recordDeliveryAchievements(history:readonly WorldHistoryEvent[],root:DeliveryFleetVessel|null|undefined,{practice=false}:{practice?:boolean}={}):readonly WorldHistoryEvent[]{
 if(practice||!root)return history;
 for(const site of DELIVERY_SITES){if(history.some(e=>e.type==='delivery'&&e.siteId===site.id))continue;
 for(const v of fleet(root)){
  const d=deliveryTelemetry(v,history,{site});if(!d.ready||v.time<=0)continue;const sources=d.launchEventIds;if(!sources)throw Error('配達記録の出発元が見つかりません');
  return appendHistory({history,universalTime:root.universalTime},'delivery',{
   vesselId:v.vesselId,vesselName:v.vesselName,state:{time:v.time},parts:v.parts
  },{launchEventIds:sources,delivery:{siteId:site.id,probePartId:d.probePartId,distance:d.distance,speed:d.speed}});
 }}
 return history;
}

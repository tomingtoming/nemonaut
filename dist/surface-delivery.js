import {PARTS} from './catalog.js';
import {fleet} from './fleet.js';
import {descentTelemetry} from './descent.js';
import {surfaceRelativeVelocity} from './surface-frame.js';
import {launchOrigins,surfaceOrigins} from './launch-provenance.js';
import {appendHistory} from './world-history.js';
import {DELIVERY_SITE,DELIVERY_SITES,deliveryDistance} from './delivery-sites.js';

export function deliveryTelemetry(v,history,{practice=false,site=DELIVERY_SITE}={}){
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
export function recordDeliveryAchievements(history,root,{practice=false}={}){
 if(practice||!root)return history;
 for(const site of DELIVERY_SITES){if(history.some(e=>e.type==='delivery'&&e.siteId===site.id))continue;
 for(const v of fleet(root)){
  const d=deliveryTelemetry(v,history,{site});if(!d.ready||v.time<=0)continue;
  return appendHistory({history,universalTime:root.universalTime},'delivery',{
   vesselId:v.vesselId,vesselName:v.vesselName,state:{time:v.time},parts:v.parts
  },{launchEventIds:d.launchEventIds,delivery:{siteId:site.id,probePartId:d.probePartId,distance:d.distance,speed:d.speed}});
 }}
 return history;
}

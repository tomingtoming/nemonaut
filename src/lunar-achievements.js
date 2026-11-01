import {fleet} from './fleet.js';
import {bodyOrbitState} from './celestial.js';
import {descentTelemetry} from './descent.js';
import {appendHistory} from './world-history.js';
import {launchOrigins,surfaceOrigins} from './launch-provenance.js';

// Called with observed simulation states, including after coast updates.
// Surface-launch lineage survives staging; placed/unknown parts earn nothing.
export function recordLunarAchievements(history,root,{practice=false}={}){
 if(practice||!root)return history;
 const origins=launchOrigins(history),recorded=new Set(history.map(e=>e.type+':'+e.vesselId));
 const arrivedParts=new Set(history.filter(e=>e.type==='moon-arrival').flatMap(e=>e.partIds));
 let result=history;
 for(const vessel of fleet(root)){
  if(vessel.crashed||vessel.time<=0)continue;
  const sources=surfaceOrigins(vessel.parts.map(p=>p.id),origins);if(!sources)continue;
  const center=vessel.stats.com.clone().applyQuaternion(vessel.q).add(vessel.pos);
  const orbit=bodyOrbitState(center,vessel.vel,vessel.universalTime);
  if(orbit.bodyId!=='moon'||orbit.altitude<0)continue;
  const write=type=>{
   const key=type+':'+vessel.vesselId;
   if(recorded.has(key)&&(type==='moon-landing'||vessel.parts.every(p=>arrivedParts.has(p.id))))return;
   result=appendHistory({history:result,universalTime:root.universalTime},type,{
    vesselId:vessel.vesselId,vesselName:vessel.vesselName,state:{time:vessel.time},parts:vessel.parts
   },{launchEventIds:sources});recorded.add(key);
   if(type==='moon-arrival')for(const p of vessel.parts)arrivedParts.add(p.id);
  };
  write('moon-arrival');
  if(vessel.landed&&orbit.speed<1){
   const descent=descentTelemetry(vessel);
   if(Math.abs(descent.clearance)<.5)write('moon-landing');
  }
 }
 return result;
}

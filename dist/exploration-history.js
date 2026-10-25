import {fleet} from './fleet.js';
import {bodyOrbitState} from './celestial.js';
import {appendHistory} from './world-history.js';
import {departureMode} from './departure-mode.js';

// Only the independently identified vessel with a recorded surface departure
// is eligible. Legacy/placed craft and unproven detached branches earn nothing.
// Recompute from COM motion instead of trusting a cached display orbit.
export function recordOrbitAchievements(history,root,{practice=false}={}){
 if(practice||!root)return history;
 const launched=new Set(history.filter(e=>e.type==='launch'&&e.environment!==undefined&&departureMode(e.environment).mode==='surface').map(e=>e.vesselId));
 const achieved=new Set(history.filter(e=>e.type==='orbit').map(e=>e.vesselId));
 let result=history;
 for(const vessel of fleet(root)){
  if(!launched.has(vessel.vesselId)||achieved.has(vessel.vesselId)||vessel.crashed||vessel.landed||vessel.time<=0)continue;
  const center=vessel.stats.com.clone().applyQuaternion(vessel.q).add(vessel.pos);
  const orbit=bodyOrbitState(center,vessel.vel,vessel.universalTime);
  if(orbit.bodyId!=='planet'||!orbit.stable||!Number.isFinite(orbit.apoapsis)||orbit.apoapsis<orbit.periapsis)continue;
  result=appendHistory({history:result,universalTime:root.universalTime},'orbit',{
   vesselId:vessel.vesselId,vesselName:vessel.vesselName,state:{time:vessel.time},parts:vessel.parts
  },{bodyId:'planet',periapsis:orbit.periapsis,apoapsis:orbit.apoapsis});
  achieved.add(vessel.vesselId);
 }
 return result;
}

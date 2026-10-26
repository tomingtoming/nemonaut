import {fleet} from './fleet.js';
import {bodyOrbitState} from './celestial.js';
import {appendHistory} from './world-history.js';
import {launchOrigins,surfaceOrigins} from './launch-provenance.js';

// All parts must have recorded surface departures, across separation/docking.
// Legacy/placed craft and unknown additions earn nothing.
// Recompute from COM motion instead of trusting a cached display orbit.
export function recordOrbitAchievements(history,root,{practice=false}={}){
 if(practice||!root)return history;
 const origins=launchOrigins(history);
 const achieved=new Set(history.filter(e=>e.type==='orbit').map(e=>e.vesselId));
 let result=history;
 for(const vessel of fleet(root)){
  if(achieved.has(vessel.vesselId)||vessel.crashed||vessel.landed||vessel.time<=0)continue;
  const sources=surfaceOrigins(vessel.parts.map(p=>p.id),origins);if(!sources)continue;
  const center=vessel.stats.com.clone().applyQuaternion(vessel.q).add(vessel.pos);
  const orbit=bodyOrbitState(center,vessel.vel,vessel.universalTime);
  if(orbit.bodyId!=='planet'||!orbit.stable||!Number.isFinite(orbit.apoapsis)||orbit.apoapsis<orbit.periapsis)continue;
  result=appendHistory({history:result,universalTime:root.universalTime},'orbit',{
   vesselId:vessel.vesselId,vesselName:vessel.vesselName,state:{time:vessel.time},parts:vessel.parts
  },{bodyId:'planet',periapsis:orbit.periapsis,apoapsis:orbit.apoapsis},sources);
  achieved.add(vessel.vesselId);
 }
 return result;
}

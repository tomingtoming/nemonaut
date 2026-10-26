// Measure existing solar geometry; candidate observation loads are design estimates,
// not active game consumers. Run: node tools/station-power-profile.mjs
import * as T from 'three';
import {part} from '../dist/catalog.js';
import {PRIMARY} from '../dist/celestial.js';
import {DELIVERY_SITE,deliverySitePosition} from '../dist/delivery-sites.js';
import {PRIMARY_ROTATION_PERIOD,surfaceOrientation} from '../dist/surface-frame.js';
import {solarGeneration,inEclipse,createCharge,powerStep,powerTotals} from '../dist/power.js';
const probe=part('probe'),panel=part('solar',[0,.4,0],[-Math.PI/2,0,0],probe.id),parts=[probe,panel],idle={pitch:0,yaw:0,roll:0};
function sample(time){
 const q=surfaceOrientation(time).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-DELIVERY_SITE.north/PRIMARY.radius));
 const position=deliverySitePosition(time).add(new T.Vector3(0,.5,0).applyQuaternion(q));
 return {position,q,generation:solarGeneration(parts,position,q,time),eclipse:inEclipse(position,time)};
}
function profile(step){
 let daylight=0,generated=0,peak=0,currentCharge=createCharge(parts),minimumIdle=200;
 const candidates=[200,1200,1600].map(capacity=>({capacity,stored:capacity,minimum:capacity,unpoweredSeconds:0,discarded:0}));
 const demand=.1,period=PRIMARY_ROTATION_PERIOD;
 // Three cycles remove the artificial advantage of starting with a full battery.
 for(let cycle=0;cycle<3;cycle++)for(let elapsed=0;elapsed<period;){const t=cycle*period+elapsed,dt=Math.min(step,period-elapsed),s=sample(t+dt/2);
  const current=powerStep(parts,currentCharge,s.position,s.q,idle,false,dt,t+dt/2);minimumIdle=Math.min(minimumIdle,current.stored);
  for(const c of candidates){
   const available=c.stored+s.generation*dt,requested=demand*dt,consumed=Math.min(available,requested),remaining=Math.max(0,available-consumed);
   if(cycle===2){c.minimum=Math.min(c.minimum,Math.min(c.capacity,remaining));c.unpoweredSeconds+=(requested-consumed)/demand;c.discarded+=Math.max(0,remaining-c.capacity);}
   c.stored=Math.min(c.capacity,remaining);
  }
  if(cycle===2){daylight+=s.eclipse?0:dt;generated+=s.generation*dt;peak=Math.max(peak,s.generation);}elapsed+=dt;
 }
 return {step,period,daylight,night:period-daylight,potentialGenerationEC:generated,peakGenerationECPerSecond:peak,currentIdle:{minimumEC:minimumIdle,finalEC:powerTotals(parts,currentCharge).stored},candidateLoadECPerSecond:demand,candidateCycleDemandEC:period*demand,candidates};
}
console.log(JSON.stringify({location:DELIVERY_SITE.name,geometry:'upright probe and horizontal upward-facing solar panel',scope:'Stationary geometry and real powerStep baseline; candidate load/battery values are design estimates, not implemented observation hardware.',profiles:[profile(1),profile(5)]},null,2));

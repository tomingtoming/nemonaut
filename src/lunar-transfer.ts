import * as T from 'three';
import {PLANET,center} from './planet.js';
import {MOON,bodyState} from './celestial.js';

// Circular, coplanar departure with a finite-burn midpoint approximation.
// phaseOffset is an explicit encounter geometry parameter, not a clock offset.
// Subsequent trajectory prediction must check the encounter, not just this seed.
export function lunarTransferSeed(time,{mass,thrust,isp,radius=680000,phaseOffset=.26,preparation=0}:{mass?:number,thrust?:number,isp?:number,radius?:number,phaseOffset?:number,preparation?:number}={}){
 if(![time,mass,thrust,isp,radius,phaseOffset,preparation].every(Number.isFinite)||time<0||preparation<0||preparation>3600||mass<=0||thrust<=0||isp<=0||radius<=PLANET.radius+PLANET.atmosphereTop||radius>=MOON.orbitRadius)throw Error('月遷移の初期条件が不正です');
 const a=(radius+MOON.orbitRadius)/2,circularSpeed=Math.sqrt(PLANET.mu/radius),deltaV=Math.sqrt(PLANET.mu*(2/radius-1/a))-circularSpeed,coastTime=Math.PI*Math.sqrt(a**3/PLANET.mu),exhaustVelocity=isp*9.81;
 const fuelRequired=mass*(1-Math.exp(-deltaV/exhaustVelocity)),burnTime=fuelRequired*exhaustVelocity/thrust,orbitalRate=circularSpeed/radius;
 const moon=bodyState(MOON,time+preparation+coastTime+burnTime/2).position.sub(center),phase=Math.atan2(moon.z,moon.y)-Math.PI-orbitalRate*(preparation+burnTime/2)+phaseOffset;
 const radial=new T.Vector3(0,Math.cos(phase),Math.sin(phase)),direction=new T.Vector3(0,-Math.sin(phase),Math.cos(phase));
 return {position:center.clone().addScaledVector(radial,radius),velocity:direction.clone().multiplyScalar(circularSpeed),direction,deltaV,burnTime,fuelRequired,coastTime,phaseOffset,time,burnStart:time+preparation};
}

export function createTransferGuide(seed){return {startTime:seed.burnStart,target:seed.deltaV,burnTime:seed.burnTime,delivered:0,firstBurnTime:null};}
export function advanceTransferGuide(guide,force,velocity,mass,dt,time){
 if(!guide||force.lengthSq()===0)return;
 if(guide.firstBurnTime===null)guide.firstBurnTime=time;
 guide.delivered+=force.dot(velocity.clone().normalize())/mass*dt;
}
export function validateTransferGuide(value){
 if(value==null)return null;
 if(!['startTime','target','burnTime','delivered'].every(k=>Number.isFinite(value[k]))||value.startTime<0||value.startTime>1e12||value.target<=0||value.target>10000||value.burnTime<=0||value.burnTime>1e6||Math.abs(value.delivered)>1e8||(value.firstBurnTime!==null&&(!Number.isFinite(value.firstBurnTime)||value.firstBurnTime<0||value.firstBurnTime>1e12)))throw Error('月遷移ガイドの保存値が不正です');
 return {startTime:value.startTime,target:value.target,burnTime:value.burnTime,delivered:value.delivered,firstBurnTime:value.firstBurnTime};
}

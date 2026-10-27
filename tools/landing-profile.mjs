// Airborne fixtures test approach capture, not a normal departure/return mission.
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset,PARTS} from '../dist/catalog.js';
import {PRIMARY,bodyUp} from '../dist/celestial.js';
import {fixedToInertial,launchSiteOrientation,surfaceVelocity,surfaceAngularVelocity} from '../dist/surface-frame.js';
import {LandingPrototype} from './landing-prototype.mjs';
import {extendWheelTrack} from '../dist/runway-wheel-track.js';
export function landingFixture({kind='plane-large',offset=200,headingOffset=0,fuelLoad=.5}={}){
const parts=preset(kind);for(const p of parts)if(PARTS[p.type].fuel)p.fuelLoad=fuelLoad;
const f=new Flight(parts,'runway',161700);f.stageNext();f.throttle=.5;
const local=new T.Vector3(offset,PRIMARY.radius,-6150).normalize().multiplyScalar(PRIMARY.radius+350).applyQuaternion(launchSiteOrientation('runway'));
const center=fixedToInertial(local,f.universalTime);
const up=bodyUp(center,f.universalTime),east=new T.Vector3(1,0,0).cross(up).normalize(),right=up.clone().cross(east).normalize();
f.q.setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,east)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),headingOffset*Math.PI/180));
f.q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-4*Math.PI/180));f.holdQ=f.q.clone();
f.pos.copy(center).sub(f.stats.com.clone().applyQuaternion(f.q));f.vel.copy(surfaceVelocity(center,f.universalTime)).addScaledVector(east,90);
return f;
}
export function runLandingProfile({kind='plane-large',offset=200,headingOffset=0,seconds=180,rollIntegral=false,lateralMode='acceleration',lateralTime=8,rollGain=12,speedFloor=90,approachAlpha=8,useTrimPlan=true,fuelLoad=.5,log=()=>{}}={}){
const f=landingFixture({kind,offset,headingOffset,fuelLoad});
const pilot=new LandingPrototype(f,{rollIntegral,lateralMode,lateralTime,rollGain,speedFloor,approachAlpha,useTrimPlan});let touch=null,track=null;
try{
 for(let i=0;i<seconds*120&&!f.crashed&&!['stopped','failed'].includes(pilot.phase);i++){
  const before={...pilot.telemetry};f.step(1/120,pilot.update(f,1/120));
  if(f.telemetry.contacts){touch??={...before,time:f.time,impact:f.telemetry.wheelImpactSpeed};track=extendWheelTrack(track,f.telemetry.wheelContacts);}
  if(i%120===0){
   const currentCenter=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),localUp=bodyUp(currentCenter,f.universalTime).applyQuaternion(f.q.clone().invert());
   log({kind,t:f.time,phase:pilot.phase,...pilot.telemetry,actualPitch:Math.asin(T.MathUtils.clamp(localUp.z,-1,1))*180/Math.PI,bank:Math.atan2(localUp.x,localUp.y)*180/Math.PI,commands:f.telemetry.commands,angularRate:f.omega.clone().sub(surfaceAngularVelocity()).applyQuaternion(f.q.clone().invert()).toArray()});
  }
 }
 return {kind,offset,headingOffset,rollIntegral,lateralMode,lateralTime,rollGain,speedFloor,approachAlpha,fuelLoad,trimPlan:pilot.trimPlan,result:pilot.phase,reason:pilot.reason,abort:pilot.abort,crashed:f.crashed,landed:f.landed,touch,track,final:pilot.telemetry};
}finally{f.dispose();}

}
if(process.argv[1]?.endsWith('landing-profile.mjs')){
 const legacy=process.argv.includes('--legacy');
 console.log(JSON.stringify(runLandingProfile({kind:process.argv[2]??'plane-large',offset:Number(process.argv[3]??200),headingOffset:Number(process.argv[4]??0),rollIntegral:process.argv.includes('--roll-integral'),useTrimPlan:!legacy,lateralMode:legacy?'heading':'acceleration',rollGain:legacy?4:12,log:r=>console.log(JSON.stringify(r))})));
}

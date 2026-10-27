// Compare rollout-only changes against the same airborne approach fixture.
// No pose/velocity edits after fixture creation; not a normal departure proof.
import * as T from 'three';
import {landingFixture} from './landing-profile.mjs';
import {LandingPrototype} from './landing-prototype.mjs';
import {bodyUp} from '../dist/celestial.js';
import {surfaceAngularVelocity} from '../dist/surface-frame.js';
import {RolloutControl} from './rollout-control.mjs';
import {RUNWAY} from '../dist/runway-navigation.js';
const clamp=T.MathUtils.clamp;
export function rolloutImpact({kind='plane-large',mode='baseline',fuelLoad=.5,offset=0}={}){
 const f=landingFixture({kind,offset,fuelLoad}),pilot=new LandingPrototype(f);
 const rollout=new RolloutControl();
 let contactTime=null,touchdown=null,worst=null,rolloutStart=null;
 const initialParts=f.parts.length;
 try{
  for(let i=0;i<200*120&&!f.crashed;i++){
   const commands=pilot.update(f,1/120);
   if(pilot.phase==='stopped'||pilot.phase==='failed'||pilot.phase==='go-around')break;
   if(pilot.phase==='rollout'){
    rolloutStart??=f.time;
    if(mode==='delay'||mode==='both')f.brake=f.time-rolloutStart>=1;
    if(mode==='damp'||mode==='both'){
     const rate=-f.omega.clone().sub(surfaceAngularVelocity()).applyQuaternion(f.q.clone().invert()).x*180/Math.PI;
     commands.pitch=clamp(rate*.12,-.5,.5);
    }
    if(mode==='guarded'){
     const pitchRate=-f.omega.clone().sub(surfaceAngularVelocity()).applyQuaternion(f.q.clone().invert()).x*180/Math.PI;
     const control=rollout.step({speed:pilot.telemetry.speed,pitchRate,remaining:RUNWAY.length+pilot.telemetry.remaining},1/120);
     f.brake=control.brake;commands.pitch=control.pitch;
    }
   }
   f.step(1/120,commands);
   if(f.telemetry.contacts){
    contactTime??=f.time;
    const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
    const pitch=Math.asin(clamp(new T.Vector3(0,0,1).applyQuaternion(f.q).dot(bodyUp(center,f.universalTime)),-1,1))*180/Math.PI;
    const sample={time:f.time,sinceContact:f.time-contactTime,phase:pilot.phase,impact:f.telemetry.wheelImpactSpeed,pitch,command:commands.pitch,brake:f.brake};
    touchdown??=sample;if(!worst||sample.impact<worst.impact)worst=sample;
   }
  }
  return {kind,mode,fuelLoad,offset,result:pilot.phase,crashed:f.crashed,initialParts,remainingParts:f.parts.length,touchdown,worst,track:pilot.track,time:f.time};
 }finally{f.dispose();}
}
if(process.argv[1]?.endsWith('rollout-impact-profile.mjs'))for(const kind of ['plane','plane-large','transport-cargo'])for(const mode of ['baseline','delay','damp','both'])console.log(JSON.stringify(rolloutImpact({kind,mode})));

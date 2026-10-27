// Controlled airborne initial conditions, not proof of normal takeoff or UI use.
import * as T from 'three';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {bodyUp,bodyAltitude} from '../dist/celestial.js';
import {surfaceVelocity} from '../dist/surface-frame.js';
import {AircraftHoldPrototype} from './aircraft-hold-prototype.mjs';
for(const kind of ['plane','plane-large','transport-cargo']){
 const craft=preset(kind);if(!craft.length)throw Error('Unknown preset '+kind);
 const speed=kind==='plane'?120:90;
 const f=new Flight(craft,'runway',161700);f.stageNext();f.throttle=.5;
 const up=bodyUp(f.pos,f.universalTime),forward=new T.Vector3(0,0,1).applyQuaternion(f.q);
 f.q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-6*Math.PI/180));f.holdQ=f.q.clone();
 f.pos.addScaledVector(up,1000-bodyAltitude(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),f.universalTime));
 f.vel.copy(surfaceVelocity(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),f.universalTime)).addScaledVector(forward,speed);
 const pilot=new AircraftHoldPrototype(f,{speed});let stall=0;
 try{for(let i=0;i<180*120&&!f.crashed;i++){
  if(i===90*120)pilot.target.heading=110;
  pilot.update(f,1/120);f.step(1/120);stall=Math.max(stall,f.telemetry.stallCount??0);
  if(i% (30*120)===0)console.log(JSON.stringify({kind,t:i/120,...pilot.telemetry,stall,crashed:f.crashed}));
 }console.log(JSON.stringify({kind,final:pilot.telemetry,crashed:f.crashed,reason:pilot.reason}));}finally{f.dispose();}
}

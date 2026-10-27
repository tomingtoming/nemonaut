import * as T from 'three';
import {Flight,statistics} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {bodyUp,bodyAltitude} from '../dist/celestial.js';import {surfaceVelocity} from '../dist/surface-frame.js';
// Controlled near-ground diagnostic, not a replay of the UI flight or a manual landing.
const startHeight=Number(process.argv[2]??27.2);
if(!Number.isFinite(startHeight)||startHeight<10)throw Error('Usage: node tools/cargo-touchdown-profile.mjs [height >= 10 m]');
for(const open of [false,true])for(const dt of [1/60,1/120,1/240]){
 const craft=preset('transport-cargo');craft.find(p=>p.type==='cargoBay').cargoOpen=open;
 const f=new Flight(craft,'runway',161769.9);f.stageNext();f.throttle=.5;f.fuelRatio=83586.5/90000;
 f.stats=statistics(f.parts,f.fuel,f.ballast,f.thermal);
 const up=bodyUp(f.pos,f.universalTime),forward=new T.Vector3(0,0,1).applyQuaternion(f.q);
 f.q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-7*Math.PI/180));f.holdQ=f.q.clone();
 const com=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
 f.pos.addScaledVector(up,startHeight-bodyAltitude(com,f.universalTime));
 f.vel.copy(surfaceVelocity(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),f.universalTime)).addScaledVector(forward,Math.sqrt(70.4**2-3.5**2)).addScaledVector(up,-3.5);
 let contact=null,prior=null;
 try{for(let i=0;i<20/dt&&!f.crashed&&!f.landed;i++){
 prior={t:i*dt,h:f.orbit?.altitude,pitch:Math.asin(new T.Vector3(0,0,1).applyQuaternion(f.q).dot(bodyUp(f.pos,f.universalTime)))*180/Math.PI,vertical:f.orbit?.vertical};
 f.step(dt);
 if(f.telemetry.contacts&&!contact)contact={...prior,impact:f.telemetry.wheelImpactSpeed};
 if(f.telemetry.contacts){f.throttle=0;f.brake=true;}
 }
 console.log(JSON.stringify({startHeight,open,dt,contact,prior,crashed:f.crashed,landed:f.landed,impact:f.telemetry.wheelImpactSpeed,h:f.orbit.altitude,speed:f.telemetry.surfaceSpeed}));
 }finally{f.dispose()}
}

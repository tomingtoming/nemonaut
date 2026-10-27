import * as T from 'three';
import {Flight,statistics,validateCraft} from '../dist/core.js';
import {preset,PARTS} from '../dist/catalog.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
import {bodyUp} from '../dist/celestial.js';
// Design experiment, not a playable shuttle or orbital-flight acceptance.
// Common large airframe with rocket engines. Reduced propellant cases are
// explicit initial-condition fixtures; no state or forces change during flight.
const wingShift=Number(process.argv[2]??0),glideControl=process.argv[3]==='control',closedClimb=process.argv[4]==='closed-climb';
if(!Number.isFinite(wingShift)||Math.abs(wingShift)>5)throw Error('Usage: node tools/rocket-airframe-profile.mjs [wing shift metres -5..5] [control] [closed-climb]');
export function rocketAirframe(){
 const parts=preset('plane-large');
 for(const p of parts)if(p.type==='jetLarge'){p.type='engineSeaMedium';p.p[2]=-4.5;}
 for(const p of parts)if(['wingLarge','aileronLarge'].includes(p.type))p.p[2]+=wingShift;
 return validateCraft({version:1,parts});
}
for(const fuel of [1,.5,.1])for(const gimbal of [true,false]){
 const parts=rocketAirframe();for(const p of parts)if(PARTS[p.type].gimbal)p.gimbalEnabled=gimbal;
 const f=new Flight(parts,'runway');for(const [id,m]of f.fuel)f.fuel.set(id,m*fuel);
 f.stats=statistics(f.parts,f.fuel);f.buildColliders();f.stageNext();f.throttle=1;
 const initial={mass:f.stats.mass,com:f.stats.com.toArray(),margin:f.stats.aero.staticMargin};
 let peak=0,cut=null,final=null,maxPitch=0,touch=null,airborne=false;
 try{for(let i=0;i<100*120&&!f.crashed;i++){
  const t=i/120;if(i===40*120){f.throttle=0;cut={alt:f.orbit.altitude,vs:f.orbit.vertical};}
  let pitch=t>=10&&t<26?-1:0;
  if((glideControl&&t>=40)||(closedClimb&&t>=10)){
   const attitude=Math.asin(new T.Vector3(0,0,1).applyQuaternion(f.q).dot(bodyUp(f.pos,f.universalTime)))*180/Math.PI;
   const rate=-f.omega.clone().applyQuaternion(f.q.clone().invert()).x*180/Math.PI;
   pitch=T.MathUtils.clamp((attitude-(t<40?10:6))*.08+rate*.1,-1,1);
   if(t>=40&&f.telemetry.contacts>0)f.brake=true;
  }
  f.step(1/120,{pitch});maxPitch=Math.max(maxPitch,Math.asin(new T.Vector3(0,0,1).applyQuaternion(f.q).dot(bodyUp(f.pos,f.universalTime)))*180/Math.PI);peak=Math.max(peak,f.orbit.altitude);
  if(f.telemetry.contacts===0&&f.orbit.altitude>10)airborne=true;
  if(airborne&&!touch&&f.telemetry.contacts>0)touch={t,vs:f.orbit.vertical,speed:surfaceRelativeVelocity(f.pos,f.vel,f.universalTime).length()};
  final={t,alt:f.orbit.altitude,vs:f.orbit.vertical,speed:surfaceRelativeVelocity(f.pos,f.vel,f.universalTime).length(),pitch:Math.asin(new T.Vector3(0,0,1).applyQuaternion(f.q).dot(bodyUp(f.pos,f.universalTime)))*180/Math.PI,margin:f.stats.aero.staticMargin};
 }
 console.log(JSON.stringify({wingShift,glideControl,closedClimb,maxPitch,fuel,gimbal,initial,cut,peak,touch,final,landed:f.landed,crashed:f.crashed,remaining:f.fuelRatio,parts:f.parts.length}));
 }finally{f.dispose();}
}

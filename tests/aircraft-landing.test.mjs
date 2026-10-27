import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';

// Normal runway departure followed by a straight field landing. This exercises
// elevator/throttle/brakes only; it does not assert a return to the runway.
test('Swift can flare without losing airspeed and brake after a normal departure',()=>{
 for(const epoch of [0,159542])for(const descentThrottle of [.25,.4,.55]){
  const f=new Flight(preset('plane'),'runway',epoch);f.stageNext();f.throttle=1;
  let phase='climb',peak=0,touch=null;
  try{
   for(let i=0;i<150*120&&!f.crashed&&!f.landed;i++){
    const t=i/120,h=f.orbit?.altitude??0,vs=f.orbit?.vertical??0;
    let pitch=t>=10&&t<26?-1:0;
    if(t>=50&&phase==='climb'){phase='descend';f.throttle=descentThrottle;}
    if(phase==='descend'&&t<50.5)pitch=1;
    if(phase==='descend'&&h<60&&vs<0)phase='flare';
    if(phase==='flare'){pitch=vs < -2?-1:0;f.throttle=h<5?0:.55;}
    f.step(1/120,{pitch});peak=Math.max(peak,f.orbit.altitude);
    if(phase==='flare'&&f.telemetry.contacts>0){
     touch={vertical:f.orbit.vertical,speed:surfaceRelativeVelocity(f.pos,f.vel,f.universalTime).length()};
     f.throttle=0;f.brake=true;phase='brake';
    }
   }
   assert.ok(peak>200,'must actually depart and climb');
   assert.ok(touch,'must contact ground after the airborne flare');
   assert.ok(touch.vertical > -4&&touch.vertical<0,JSON.stringify({epoch,descentThrottle,touch}));
   assert.ok(touch.speed>80,'retain flying speed through flare');
   assert.equal(f.crashed,false);assert.equal(f.landed,true);
   assert.ok(surfaceRelativeVelocity(f.pos,f.vel,f.universalTime).length()<.8);
   assert.equal(f.parts.length,16);assert.ok(f.fuelRatio<1&&f.fuelRatio>.8);
  }finally{f.dispose();}
 }
});

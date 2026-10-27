import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {Flight} from '../dist/core.js';
import {preset,PARTS} from '../dist/catalog.js';
import {bodyAltitude} from '../dist/celestial.js';
import {TakeoffPrototype} from '../tools/takeoff-prototype.mjs';
import {ReturnSession} from '../tools/return-session.mjs';
import {LandingPlanClient} from '../tools/landing-plan-client.mjs';
import {extendWheelTrack} from '../dist/runway-wheel-track.js';
import {RUNWAY} from '../dist/runway-navigation.js';
for(const kind of ['plane','plane-large','transport-cargo'])test(`${kind} normal departure returns through real planning worker and lands`,async(t)=>{
 const parts=preset(kind);for(const p of parts)if(PARTS[p.type].fuel)p.fuelLoad=.5;
 const f=new Flight(parts,'runway',161700),id=f.vesselId,partCount=f.parts.length;
 const client=new LandingPlanClient(()=>{
  const w=new Worker(new URL('./fixtures/landing-worker.mjs',import.meta.url));
  const adapter={postMessage:data=>w.postMessage(data),terminate:()=>w.terminate()};
  w.on('message',data=>adapter.onmessage({data}));w.on('error',()=>adapter.onerror());return adapter;
 });
 const session=new ReturnSession(client),takeoff=new TakeoffPrototype(f,{speed:90,altitude:600,rotation:12,integral:true,handoff:'attitude'});
 let started=false,airborne=false,planningSteps=0,approached=false,track=null,departureTrack=null,touchdown=null,worstWheel=null;
 f.stageNext();
 try{
  for(let i=0;i<1100*120&&!f.crashed;i++){
   if(!started&&takeoff.cruise&&bodyAltitude(f.pos,f.universalTime)>580&&Math.abs(takeoff.cruise.telemetry.vertical)<1){
    // The host relinquishes departure ownership before starting return.
    f.sas=true;f.sasMode='hold';f.trim=.07;session.start(f);started=true;
   }
   const commands=started?session.step(f,1/120):takeoff.update(f,1/120);
   approached||=session.state==='approach';
   f.step(1/120,commands);
   if(!airborne&&f.telemetry.contacts)departureTrack=extendWheelTrack(departureTrack,f.telemetry.wheelContacts);
   if(!f.telemetry.contacts&&bodyAltitude(f.pos,f.universalTime)>30)airborne=true;
   if(airborne&&f.telemetry.contacts){
    assert.ok(approached,'contact before landing');track=extendWheelTrack(track,f.telemetry.wheelContacts);
    const contact={time:f.time,phase:session.state,impact:f.telemetry.wheelImpactSpeed};
    touchdown??=contact;if(!worstWheel||contact.impact<worstWheel.impact)worstWheel=contact;
   }
   if(session.pending){planningSteps++;if(i%12===0)await new Promise(resolve=>setTimeout(resolve,10));}
   if(started&&!session.owner)break;
   assert.ok(!['recovery','recovery-hold'].includes(session.state),session.message);
  }
  assert.equal(session.state,'landed',session.message);assert.ok(planningSteps>2);assert.ok(approached);
  t.diagnostic(JSON.stringify({kind,planningSteps,touchdown,worstWheel,track}));
  assert.ok(touchdown&&touchdown.impact>-3,JSON.stringify(touchdown));
  assert.ok(worstWheel&&worstWheel.impact>-3,JSON.stringify(worstWheel));
  assert.equal(f.crashed,false);assert.equal(f.landed,true);assert.equal(f.vesselId,id);assert.equal(f.parts.length,partCount);
  assert.equal(f.sas,true);assert.equal(f.trim,.07);assert.equal(f.throttle,0);assert.equal(f.brake,true);
  assert.ok([...f.fuel.values()].reduce((a,b)=>a+b,0)>0);
  for(const t of [departureTrack,track])assert.ok(t&&t.minAlong>=0&&t.maxAlong<RUNWAY.length&&t.maxCross<RUNWAY.width/2);
 }finally{session.stop();client.cancel();f.dispose();}
});

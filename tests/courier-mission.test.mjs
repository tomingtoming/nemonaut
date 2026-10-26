import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {preset} from '../dist/catalog.js';
import {launchWorld} from '../dist/world-operations.js';
import {worldFromFlight,flightFromWorld,validateWorld} from '../dist/world-save.js';
import {loadFlight,saveFlight} from '../dist/flight-save.js';
import {deliverySitePosition,deliveryDistance} from '../dist/delivery-sites.js';
import {deliveryTelemetry,recordDeliveryAchievements} from '../dist/surface-delivery.js';
import {fleet} from '../dist/fleet.js';
test('Courier physically drives from the pad, separates a station and preserves delivery and both vessels',()=>{
const world=launchWorld(worldFromFlight(null),{parts:preset('courier'),name:'Courier',environment:'land'}),f=loadFlight(flightFromWorld(world));
try{f.sas=false;f.stageNext();f.throttle=.5;
let stopped=false;
for(let i=0;i<120*300&&!f.crashed;i++){
 const target=deliverySitePosition(f.universalTime).sub(f.pos).applyQuaternion(f.q.clone().invert()),angle=Math.atan2(target.x,target.z),distance=deliveryDistance(f.pos,f.universalTime);
 if(distance<12){f.throttle=0;f.brake=true;stopped=true;}
 f.step(1/120,{yaw:stopped?0:Math.max(-1,Math.min(1,angle*2))});

 if(stopped&&f.landed)break;
}
f.throttle=0;f.brake=true;
for(let i=0;i<600;i++)f.step(1/120);
assert.ok(stopped);assert.equal(f.crashed,false);assert.equal(deliveryTelemetry(f,world.history).reason,'運搬機から分離');assert.equal(recordDeliveryAchievements(world.history,f),world.history);f.stageNext();
for(let i=0;i<1200;i++)f.step(1/120);
assert.equal(f.crashed,false);assert.ok(f.landed);assert.ok(deliveryTelemetry(f,world.history).ready);assert.equal(f.parts.length,2);assert.equal(f.detached.length,1);
const history=recordDeliveryAchievements(world.history,f);assert.equal(history.at(-1).type,'delivery');
const saved=validateWorld(JSON.parse(JSON.stringify(worldFromFlight(saveFlight(f),{history}))));assert.equal(saved.vessels.length,2);assert.deepEqual(saved.history,history);
const restored=loadFlight(flightFromWorld(saved));try{assert.equal(recordDeliveryAchievements(saved.history,restored),saved.history);}finally{restored.dispose();}
}finally{f.dispose();}
});


test('Courier remains upright during a full-key steering correction at cruising speed',()=>{
 const w=launchWorld(worldFromFlight(null),{parts:preset('courier'),name:'Steering',environment:'land'}),f=loadFlight(flightFromWorld(w));
 try{f.sas=false;f.stageNext();for(let i=0;i<25*120;i++)f.step(1/120,{drive:1});
  for(let i=0;i<10*120;i++){f.step(1/120,{drive:1,yaw:1});const up=f.pos.clone().add(new T.Vector3(0,600000,0)).normalize();assert.ok(new T.Vector3(0,1,0).applyQuaternion(f.q).dot(up)>.7);assert.equal(f.crashed,false);}
  const wheel=f.parts.find(p=>p.type==='wheel'&&p.steeringEnabled!==false);assert.ok(Math.abs(f.wheelMotion.get(wheel.id).steer)<.2);
 }finally{f.dispose();}
});

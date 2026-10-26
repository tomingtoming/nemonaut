import {withRendezvousTarget} from '../dist/rendezvous-practice.js';import {worldFromFlight,flightFromWorld} from '../dist/world-save.js';import {launchWorld} from '../dist/world-operations.js';import {loadFlight} from '../dist/flight-save.js';
import {portGuidance} from '../dist/port-navigation.js';import {setTarget} from '../dist/relative-navigation.js';import {dockingStatus,dockVessels} from '../dist/docking.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {timedRendezvousTransfer,timedRelativeStopPlan,transferThrottle} from '../dist/timed-rendezvous.js';
import * as T from 'three';import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';import {bodyOrbitState} from '../dist/celestial.js';import {center} from '../dist/planet.js';import {centerOfVessel,relativeState} from '../dist/relative-navigation.js';import {maneuverPreview} from '../dist/maneuver.js';import {createManeuverNode,maneuverDirection} from '../dist/maneuver-node.js';import {advanceCoastFleet} from '../dist/coast-flight.js';
test('Same orbital tug transfers 20 km, brakes, approaches with RCS and docks through physical forces',()=>{
const world=withRendezvousTarget(launchWorld(worldFromFlight(null),{parts:preset('orbital-tug'),environment:'orbit',name:'Tug'}));
let f=loadFlight(flightFromWorld(world)),g=f.detached[0];assert.ok(relativeState(f,g).distance>20000);
try{f.stageNext();const plan=timedRendezvousTransfer(f,bodyOrbitState(centerOfVessel(g),g.vel,0));assert.ok(plan.burn.duration>0);const preview=maneuverPreview(centerOfVessel(f),f.vel,{universalTime:plan.epoch},plan.components,0);f.maneuver=createManeuverNode(preview,f.time);f.maneuver.stopAtTarget=true;f.maneuver.tolerance=.05;f.sasMode='maneuver';while(f.universalTime<plan.epoch-1e-6)f.step(Math.min(1/120,plan.epoch-f.universalTime));assert.ok(new T.Vector3(0,1,0).applyQuaternion(f.q).angleTo(maneuverDirection(f.maneuver))<.001);for(let i=0;i<120*120&&!f.maneuver.complete;i++){f.throttle=Math.hypot(...f.maneuver.remaining)<.5?.01:Math.hypot(...f.maneuver.remaining)<2?.1:1;f.step(1/120);}f.throttle=0;assert.equal(f.maneuver.complete,true);assert.ok(f.fuelRatio<1);const stop=timedRelativeStopPlan(f,bodyOrbitState(centerOfVessel(g),g.vel,g.universalTime));assert.ok(stop.time>60);
f.maneuver=createManeuverNode(maneuverPreview(centerOfVessel(f),f.vel,stop.location,stop.components,f.universalTime),f.time);f.maneuver.stopAtTarget=true;f.maneuver.tolerance=.05;
const coast=advanceCoastFleet(f,stop.time,{maxSteps:10000});assert.equal(coast.reason,'予定噴射の直前');assert.ok(Math.abs(stop.location.universalTime-f.universalTime-60)<.05);while(f.universalTime<stop.location.universalTime-1e-6)f.step(Math.min(1/120,stop.location.universalTime-f.universalTime));assert.ok(new T.Vector3(0,1,0).applyQuaternion(f.q).angleTo(maneuverDirection(f.maneuver))<.001);
for(let i=0;i<120*120&&!f.maneuver.complete;i++){f.throttle=transferThrottle(Math.hypot(...f.maneuver.remaining));f.step(1/120);}assert.equal(f.maneuver.complete,true);assert.equal(f.throttle,0);assert.ok(relativeState(f,g).distance>40&&relativeState(f,g).distance<70);assert.ok(relativeState(f,g).speed<.1);assert.ok(f.fuelRatio<1);

const ai=f.parts.find(p=>p.type==='dockingPort').id,bi=g.parts.find(p=>p.type==='dockingPort').id;setTarget(f,f,g);f.dockingPorts={own:ai,target:bi};f.rcsEnabled=true;f.sasMode='dock';f.portTranslationEnabled=true;
const clamp=x=>T.MathUtils.clamp(x,-1,1);let i=0;
for(;i<600*120;i++){const nav=portGuidance(f,ai,g,bi);if(dockingStatus(f,ai,g,bi).ready)break;const desired=clamp((nav.axial-(nav.lateral>1?20:0))*.12)*.6;f.step(1/120,{portForward:clamp((desired-nav.closing)*2),portRight:clamp(-nav.horizontal*.15-nav.horizontalSpeed*2),portUp:clamp(-nav.vertical*.15-nav.verticalSpeed*2)});}
assert.ok(i/120<180,'RCS approach finishes without resetting either vessel');
assert.ok(dockingStatus(f,ai,g,bi).ready);assert.ok(dockingStatus(f,ai,g,bi).speed<.03);
const monoprop=f.parts.filter(p=>p.type==='rcs').reduce((sum,p)=>sum+f.fuel.get(p.id),0);assert.ok(monoprop>20&&monoprop<48,'actual RCS fuel is consumed');
assert.ok(f.fuel.get(f.parts.find(p=>p.type==='tank').id)<1800,'both main-engine burns consume fuel');
const fuelBefore=[...f.fuel.values(),...g.fuel.values()].reduce((a,b)=>a+b,0);
f=dockVessels(f,g,ai,bi);assert.equal(f.parts.length,20);assert.equal(f.detached.length,0);assert.ok(Math.abs([...f.fuel.values()].reduce((a,b)=>a+b,0)-fuelBefore)<1e-6);
}finally{f.dispose();}

});

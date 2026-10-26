import test from 'node:test';import assert from 'node:assert/strict';
import * as T from 'three';
import {withRendezvousTarget} from '../dist/rendezvous-practice.js';
import {worldFromFlight,flightFromWorld} from '../dist/world-save.js';
import {launchWorld} from '../dist/world-operations.js';
import {loadFlight} from '../dist/flight-save.js';
import {preset} from '../dist/catalog.js';
import {timedRendezvousTransfer,timedRelativeStopPlan,transferThrottle} from '../dist/timed-rendezvous.js';
import {bodyOrbitState} from '../dist/celestial.js';
import {centerOfVessel,relativeState,setTarget} from '../dist/relative-navigation.js';
import {maneuverPreview} from '../dist/maneuver.js';
import {createManeuverNode} from '../dist/maneuver-node.js';
import {advanceCoastFleet} from '../dist/coast-flight.js';
import {portGuidance} from '../dist/port-navigation.js';
import {dockingStatus,dockVessels} from '../dist/docking.js';
test('Delayed burns can be corrected by a two-minute transfer and fuel-efficient RCS docking',()=>{
let f=loadFlight(flightFromWorld(withRendezvousTarget(launchWorld(worldFromFlight(null),{parts:preset('orbital-tug'),environment:'orbit',name:'Tug'}))));const g=f.detached[0];
const target=()=>bodyOrbitState(centerOfVessel(g),g.vel,g.universalTime);
function execute(plan,delay=0,full=false){
 const location=plan.location??{universalTime:plan.epoch};
 f.maneuver=createManeuverNode(maneuverPreview(centerOfVessel(f),f.vel,location,plan.components,f.universalTime),f.time);f.maneuver.stopAtTarget=true;f.maneuver.tolerance=.05;f.sasMode='maneuver';
 advanceCoastFleet(f,Math.max(0,location.universalTime-f.universalTime),{maxSteps:10000});
 while(f.universalTime<location.universalTime+delay-1e-6)f.step(Math.min(1/120,location.universalTime+delay-f.universalTime));
 for(let i=0;i<120*120&&!f.maneuver.complete;i++){f.throttle=full?1:transferThrottle(Math.hypot(...f.maneuver.remaining));f.step(1/120);}
 f.throttle=0;if(!f.maneuver.complete)throw Error('burn incomplete');
}
try{
 f.stageNext();execute(timedRendezvousTransfer(f,target()),5.5,true);
 f.throttle=.1;for(let i=0;i<84;i++)f.step(1/120);f.throttle=.01;for(let i=0;i<840;i++)f.step(1/120);f.throttle=0;
 execute(timedRelativeStopPlan(f,target()),5.1,true);assert.ok(relativeState(f,g).distance>600&&relativeState(f,g).distance<700);
 const correction=timedRendezvousTransfer(f,target(),{duration:120});assert.ok(correction.deltaV>3&&correction.deltaV<4);execute(correction);
 const stop=timedRelativeStopPlan(f,target());assert.ok(stop.time>60);execute(stop);assert.ok(relativeState(f,g).distance<100);assert.ok(relativeState(f,g).speed<.1);
 const ai=f.parts.find(p=>p.type==='dockingPort').id,bi=g.parts.find(p=>p.type==='dockingPort').id;setTarget(f,f,g);f.dockingPorts={own:ai,target:bi};f.rcsEnabled=true;f.sasMode='dock';f.portTranslationEnabled=true;
 const clamp=x=>T.MathUtils.clamp(x,-1,1);let i=0;for(;i<600*120;i++){const n=portGuidance(f,ai,g,bi);if(dockingStatus(f,ai,g,bi).ready)break;const desired=clamp((n.axial-(n.lateral>1?20:0))*.12)*.6;f.step(1/120,{portForward:clamp((desired-n.closing)*2),portRight:clamp((clamp(-n.horizontal*.15)*.6-n.horizontalSpeed)*2),portUp:clamp((clamp(-n.vertical*.15)*.6-n.verticalSpeed)*2)});}
 assert.ok(i/120<240);assert.ok(dockingStatus(f,ai,g,bi).ready);assert.ok(dockingStatus(f,ai,g,bi).speed<.03);const rcsFuel=f.parts.filter(p=>p.type==='rcs').reduce((sum,p)=>sum+f.fuel.get(p.id),0);assert.ok(rcsFuel>25&&rcsFuel<48);f=dockVessels(f,g,ai,bi);assert.equal(f.parts.length,20);assert.equal(f.detached.length,0);
}finally{f.dispose();}

});

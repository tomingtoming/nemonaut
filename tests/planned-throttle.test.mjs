import test from 'node:test';import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';import {finiteReturnPlan} from '../dist/finite-return-plan.js';import {createManeuverNode,validateManeuverNode} from '../dist/maneuver-node.js';import {saveFlight,loadFlight} from '../dist/flight-save.js';
test('planned throttle survives save/reload without changing live throttle or fuel',()=>{
 const f=new Flight(preset('returner'),'orbit');let restored;try{f.stageNext();f.stageNext();const p=finiteReturnPlan(f,{throttle:.1});f.maneuver=createManeuverNode(p.preview,0,{plannedThrottle:p.throttle});f.maneuver.tolerance=.05;const fuel=[...f.fuel];restored=loadFlight(JSON.parse(JSON.stringify(saveFlight(f))));assert.equal(restored.maneuver.plannedThrottle,.1);assert.equal(restored.throttle,0);assert.deepEqual([...restored.fuel],fuel);for(let i=0;i<120;i++)restored.step(1/120);assert.equal(restored.throttle,0);assert.deepEqual([...restored.fuel],fuel);
 for(const bad of [null,0,2,-1,NaN,'0.1',.2]){assert.throws(()=>validateManeuverNode({...f.maneuver,plannedThrottle:bad}));assert.throws(()=>createManeuverNode(p.preview,0,{plannedThrottle:bad}));}
 const legacy=createManeuverNode(p.preview,0);assert.equal(Object.hasOwn(validateManeuverNode(legacy),'plannedThrottle'),false);for(const value of [.01,.1,1])assert.equal(validateManeuverNode({...legacy,plannedThrottle:value}).plannedThrottle,value);
 }finally{f.dispose();restored?.dispose();}
});

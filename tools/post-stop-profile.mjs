import {writeFileSync} from 'node:fs';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {TakeoffPrototype} from './takeoff-prototype.mjs';
const progress=process.argv[2];if(!progress)throw Error('Absolute progress-file path required');
const f=new Flight(preset('transport-cargo'),'runway',161700);f.stageNext();
const p=new TakeoffPrototype(f,{speed:90,rotation:12,integral:true,handoff:'attitude',abortGuard:true});
const begun=performance.now(),worldStep=f.world.step.bind(f.world);
let tick=0,worldMs=0;
const mark=phase=>{if(tick%120===0)writeFileSync(progress,JSON.stringify({phase,time:f.time,elapsedMs:performance.now()-begun,worldMs,speed:f.telemetry.surfaceSpeed,position:f.pos.toArray(),velocity:f.vel.toArray()}));};
f.world.step=(...args)=>{mark('before-world');const start=performance.now(),result=worldStep(...args);worldMs+=performance.now()-start;mark('after-world');return result;};
try{
 for(;tick<300*120&&!f.crashed;tick++){mark('before-flight');f.step(1/120,p.update(f,1/120));mark('after-flight');}
 console.log(JSON.stringify({time:f.time,phase:p.phase,crashed:f.crashed,worldMs,elapsedMs:performance.now()-begun}));
}finally{f.dispose();}

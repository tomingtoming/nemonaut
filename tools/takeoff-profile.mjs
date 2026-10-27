import {Flight,statistics} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {TakeoffPrototype} from './takeoff-prototype.mjs';
const requested=process.argv.slice(2).find(s=>!s.startsWith('--')),rotation=Number(process.argv.find(s=>s.startsWith('--rotation='))?.split('=')[1]??8);
for(const kind of requested?[requested]:['plane','plane-large','transport-cargo'])for(const fraction of [1,.5]){
 const f=new Flight(preset(kind),'runway',161700);f.stageNext();
 for(const [id,amount]of f.fuel)f.fuel.set(id,amount*fraction);
 f.stats=statistics(f.parts,f.fuel,f.ballast,f.thermal);
 const p=new TakeoffPrototype(f,{speed:kind==='plane'?120:90,rotation});let handoff=null,peak=0;
 try{for(let i=0;i<180*120&&!f.crashed;i++){
  const input=p.update(f,1/120);f.step(1/120,input);peak=Math.max(peak,f.orbit.altitude);
  if(p.phase==='cruise'&&!handoff)handoff={time:f.time,...p.telemetry};
  if(i%(30*120)===0||(i<60*120&&i%120===0))console.log(JSON.stringify({kind,fraction,rotation,t:f.time,phase:p.phase,...p.telemetry}));
 }console.log(JSON.stringify({kind,fraction,final:true,phase:p.phase,handoff,peak,height:f.orbit.altitude,speed:f.telemetry.surfaceSpeed,crashed:f.crashed,parts:f.parts.length,cruise:p.cruise?.telemetry}));}
 finally{f.dispose();}
}

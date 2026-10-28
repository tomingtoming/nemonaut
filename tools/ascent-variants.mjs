import {Flight} from '../dist/core.js';import {preset,PARTS} from '../dist/catalog.js';
import {PRIMARY_ROTATION_PERIOD} from '../dist/surface-frame.js';
import {AscentSession} from './ascent-session.mjs';
for(const [kind,epoch,limit]of [['launcher',PRIMARY_ROTATION_PERIOD/4,1],['launcher',PRIMARY_ROTATION_PERIOD/2,1],['atlas',PRIMARY_ROTATION_PERIOD*3/4,1],['launcher',0,.8],['atlas',0,.6]]){
 const parts=preset(kind);for(const p of parts)if(PARTS[p.type].thrust)p.thrustLimit=limit;
 const f=new Flight(parts,'land',epoch),session=new AscentSession();
 try{session.start(f,{altitude:120000});for(let i=0;i<1201*120&&session.owner;i++){session.step(f,1/120);f.step(1/120);}
  console.log(JSON.stringify({kind,epoch,limit,state:session.state,message:session.message,time:f.time,periapsis:f.orbit.periapsis,apoapsis:f.orbit.apoapsis,stage:f.stage,crashed:f.crashed,fuel:f.fuelRatio}));
 }catch(error){console.log(JSON.stringify({kind,epoch,limit,state:'rejected',message:error.message}));}finally{f.dispose();}
}

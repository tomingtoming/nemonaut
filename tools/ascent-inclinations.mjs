import {Flight} from '../dist/core.js';import {preset} from '../dist/catalog.js';
import {AscentPrototype} from './ascent-prototype.mjs';
for(const inclination of [0,30,90,150]){
 const f=new Flight(preset('launcher'),'land'),p=new AscentPrototype({altitude:120000,inclination});
 try{for(let i=0;i<1200*120&&!p.done&&!f.crashed;i++){p.update(f);f.step(1/120);}
  console.log(JSON.stringify({target:inclination,actual:p.actualInclination,phase:p.phase,time:f.time,periapsis:f.orbit.periapsis,apoapsis:f.orbit.apoapsis,crashed:f.crashed,fuel:f.fuelRatio}));
 }finally{f.dispose();}
}

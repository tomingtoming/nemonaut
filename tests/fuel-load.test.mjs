import test from 'node:test';
import assert from 'node:assert/strict';
import {preset,PARTS} from '../dist/catalog.js';
import {Flight,statistics,validateCraft} from '../dist/core.js';
import {createFuel,stagePerformance} from '../dist/resources.js';
import {editSymmetrySetting} from '../dist/symmetry.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';
import {appendDesign,readDesignLibrary,designForLaunch} from '../dist/design-library.js';
test('fuel load survives design launch and changes actual mass, COM and stage fuel',()=>{
 const full=preset('transport-cargo'),tank=full.find(p=>PARTS[p.type].fuel);
 const parts=editSymmetrySetting(full,tank.id,'fuelLoad',.5,false);
 const saved=appendDesign({version:1,designs:[]},{name:'Fuel load',parts,bay:'sph',environment:'runway'},'load',1);
 const restored=designForLaunch(readDesignLibrary(JSON.parse(JSON.stringify(saved))),'load','runway').parts;
 const f=new Flight(restored,'runway');
 try{
  const before=statistics(full),after=statistics(restored),used=PARTS[tank.type].fuel*.5;
  assert.equal(before.mass-after.mass,used);assert.ok(before.com.distanceTo(after.com)>.01);
  assert.equal(f.fuel.get(tank.id),used);assert.equal(f.stats.mass,after.mass);
  assert.equal(stagePerformance(full)[0].fuel-stagePerformance(restored)[0].fuel,used);
  assert.equal(statistics(restored,f.fuel).mass,after.mass);
  f.fuel.set(tank.id,used*.8);const loaded=loadFlight(saveFlight(f));
  try{assert.equal(loaded.fuel.get(tank.id),used*.8);assert.equal(loaded.parts.find(p=>p.id===tank.id).fuelLoad,.5);}finally{loaded.dispose();}
  assert.equal(full.find(p=>p.id===tank.id).fuelLoad,undefined);
 }finally{f.dispose();}
});
test('empty fuel and legacy full defaults work; invalid resource settings fail',()=>{
 const parts=preset('plane'),tank=parts.find(p=>PARTS[p.type].fuel),wing=parts.find(p=>PARTS[p.type].wing);
 assert.equal(createFuel(parts).get(tank.id),PARTS[tank.type].fuel);
 const empty=editSymmetrySetting(parts,tank.id,'fuelLoad',0);assert.equal(createFuel(empty).get(tank.id),0);assert.equal(stagePerformance(empty).length,0);
 for(const value of [-.1,1.1,NaN,'0.5',false]){
  assert.throws(()=>editSymmetrySetting(parts,tank.id,'fuelLoad',value));
  assert.throws(()=>validateCraft({version:1,parts:parts.map(p=>p.id===tank.id?{...p,fuelLoad:value}:p)}));
 }
 assert.throws(()=>editSymmetrySetting(parts,wing.id,'fuelLoad',.5));
});
test('monopropellant load is counted once in design and live mass',()=>{
 const parts=preset('plane');parts.push({id:'test-rcs',type:'rcs',p:[0,1,0],r:[0,0,0],stage:0,parent:parts[0].id,fuelLoad:.25});
 // Use the catalog resource type instead of assuming the main-fuel tank path.
 const block=parts.at(-1);block.type=Object.keys(PARTS).find(k=>PARTS[k].monoprop);
 const fuel=createFuel(parts),st=statistics(parts),live=statistics(parts,fuel);
 assert.equal(fuel.get(block.id),PARTS[block.type].monoprop*.25);
 assert.equal(st.mass,live.mass);assert.equal(st.dry,live.dry);assert.equal(st.dv,live.dv);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';import {Flight,statistics} from '../dist/core.js';
import {transferTargets,transferFuel} from '../dist/fuel-transfer.js';import {saveFlight,loadFlight} from '../dist/flight-save.js';
test('Transfer conserves fuel, clamps at capacity and empty source, and preserves free-flight COM and velocity',()=>{
 const f=new Flight(preset('launcher'),'orbit');try{const group=f.networks.groups.find(g=>g.tanks.length>1),[a,b]=group.tanks;f.fuel.set(b.id,100);f.stats=statistics(f.parts,f.fuel,f.ballast,f.thermal);const before=f.stats,worldCOM=f.pos.clone().add(before.com.clone().applyQuaternion(f.q)),vel=f.vel.clone(),total=[...f.fuel.values()].reduce((a,b)=>a+b,0);
 assert.equal(f.transferFuel(a.id,b.id,200),200);assert.equal(f.fuel.get(b.id),300);assert.equal(f.stats.mass,before.mass);assert.ok(f.stats.com.distanceTo(before.com)>0);assert.ok(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)).distanceTo(worldCOM)<1e-8);assert.ok(f.vel.equals(vel));assert.ok(Math.abs(f.body.mass()-f.stats.mass)<.01);
 assert.equal(f.transferFuel(a.id,b.id,1e6),1500);assert.equal(f.transferFuel(a.id,b.id,100),0);assert.equal([...f.fuel.values()].reduce((a,b)=>a+b,0),total);
 const restored=loadFlight(saveFlight(f));try{assert.deepEqual([...restored.fuel],[...f.fuel]);}finally{restored.dispose();}
 f.fuel.set(a.id,0);assert.equal(f.transferFuel(a.id,b.id,100),0);
 }finally{f.dispose();}
});
test('Transfer rejects cross-stage, detached, wrong resource, damaged and invalid requests without changes',()=>{
 const f=new Flight(preset('launcher'),'orbit');try{const [a,b]=f.networks.groups.find(g=>g.tanks.length>1).tanks,other=f.parts.find(p=>p.type==='tank'&&!transferTargets(f,a.id).some(q=>q.id===p.id)&&p.id!==a.id),snapshot=[...f.fuel];
 for(const n of [-1,0,NaN,Infinity,'100'])assert.equal(transferFuel(f,a.id,b.id,n),0);
 for(const id of [a.id,'missing',f.parts.find(p=>p.type==='engine').id,other.id])assert.equal(transferFuel(f,a.id,id,100),0);
 f.thermal.get(b.id).failed=true;assert.equal(transferFuel(f,a.id,b.id,100),0);f.thermal.get(b.id).failed=false;f.crashed=true;assert.equal(transferFuel(f,a.id,b.id,100),0);assert.deepEqual([...f.fuel],snapshot);
 f.crashed=false;f.stageNext();f.stageNext();assert.equal(transferFuel(f,a.id,b.id,100),0);
 }finally{f.dispose();}
});

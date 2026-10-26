import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PARTS,part,preset} from '../dist/catalog.js';
import {engineShrouds,syncEngineShrouds} from '../dist/engine-shrouds.js';
import {Flight} from '../dist/core.js';
import {saveFlight,loadFlight} from '../dist/flight-save.js';

test('covers all seven rocket engines only at an occupied axial bottom socket',()=>{
 for(const type of Object.keys(PARTS).filter(t=>PARTS[t].thrust&&!PARTS[t].air&&!PARTS[t].water)){
  const e=part(type),d=PARTS[type],s=part('decoupler',[0,-d.size[1]/2-.11,0],[0,0,0],e.id);
  assert.equal(engineShrouds([e,s]).length,1,type);
  s.p[0]=.3;assert.equal(engineShrouds([e,s]).length,0);s.p[0]=0;
  s.parent=null;assert.equal(engineShrouds([e,s]).length,0);
  e.parent=s.id;assert.equal(engineShrouds([e,s]).length,1,'reverse tree');
  const rotation=new T.Euler(.4,.2,1.1),q=new T.Quaternion().setFromEuler(rotation);
  for(const p of [e,s]){p.p=new T.Vector3(...p.p).applyQuaternion(q).toArray();p.r=rotation.toArray().slice(0,3);}
  assert.equal(engineShrouds([e,s]).length,1,'rotated assembly');
 }
 const jet=part('jet'),s=part('decoupler',[0,-.71,0],[0,0,0],jet.id);assert.equal(engineShrouds([jet,s]).length,0);
});

test('Atlas shroud disappears at separation and stays absent after save/reload',()=>{
 const f=new Flight(preset('atlas'),'orbit');let restored;
 try{
  assert.equal(engineShrouds(f.parts).length,1);
  f.stageNext();assert.equal(engineShrouds(f.parts).length,1);
  f.stageNext();assert.equal(engineShrouds(f.parts).length,0);
  assert.ok(f.parts.some(p=>p.type==='engineVacMedium'));
  assert.ok(f.detached.length);for(const detached of f.detached)assert.equal(engineShrouds(detached.parts).length,0);
  restored=loadFlight(saveFlight(f));assert.equal(engineShrouds(restored.parts).length,0);
 }finally{f.dispose();restored?.dispose();}
});

test('Blender cover is a hollow sleeve and visibility follows live connectivity without accumulation',async()=>{
 const data=await readFile(new URL('../dist/assets/parts/engine-shroud.glb',import.meta.url));
 const {scene}=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
 scene.updateMatrixWorld(true);const size=new T.Box3().setFromObject(scene).getSize(new T.Vector3());
 assert.ok(Math.abs(size.y-1)<.001&&size.x>1&&size.x<1.03);
 const ray=new T.Raycaster(new T.Vector3(0,2,0),new T.Vector3(0,-1,0));assert.equal(ray.intersectObject(scene,true).length,0,'open nozzle axis');
 ray.set(new T.Vector3(2,0,0),new T.Vector3(-1,0,0));assert.ok(ray.intersectObject(scene,true).length);
 scene.traverse(o=>{if(o.isMesh)for(const name of ['position','normal'])assert.ok([...o.geometry.attributes[name].array].every(Number.isFinite));});
 const parts=preset('atlas'),objects=new Map(parts.map(p=>[p.id,new T.Group()]));
 syncEngineShrouds(parts,objects,scene);const engine=parts.find(p=>p.type==='engineVacMedium'),o=objects.get(engine.id),cover=o.userData.engineShroud;
 assert.equal(cover.visible,true);assert.deepEqual(cover.scale.toArray(),[1.25,1.8,1.25]);
 syncEngineShrouds(parts,objects,scene);assert.equal(o.children.length,1);
 syncEngineShrouds(parts.filter(p=>p.type!=='decoupler'),objects,scene);assert.equal(cover.visible,false);
 syncEngineShrouds(parts,objects,scene);assert.equal(cover.visible,true);assert.equal(o.children.length,1);
});

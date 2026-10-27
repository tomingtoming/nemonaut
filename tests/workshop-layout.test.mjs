import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {readFile} from 'node:fs/promises';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PARTS,preset} from '../dist/catalog.js';import {workshopLayout,workshopFrame} from '../dist/workshop-layout.js';

test('Actual Blender preset bounds clear the workshop floor without changing designs',async()=>{
 const assets=new Map();for(const [id,d]of Object.entries(PARTS)){const data=await readFile(new URL(`../dist/assets/parts/${d.model||id}.glb`,import.meta.url));const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');assets.set(id,new T.Box3().setFromObject(gltf.scene));}
 for(const type of ['returner','launcher','twin','plane','rover','boat','sub','plane-large','boat-large','sub-large']){
  const parts=preset(type),before=structuredClone(parts),bounds=new T.Box3();
  for(const p of parts){const matrix=new T.Matrix4().compose(new T.Vector3(...p.p),new T.Quaternion().setFromEuler(new T.Euler(...p.r)),new T.Vector3(1,1,1));bounds.union(assets.get(p.type).clone().applyMatrix4(matrix));}
  const layout=workshopLayout(bounds);assert.ok(layout.origin[1]<bounds.min.y,`${type}: lowest model above floor`);assert.deepEqual(parts,before);
  for(const aspect of [.45,1,2]){
   const room=workshopLayout(bounds,40,aspect),fit=workshopFrame(bounds,40,aspect);assert.ok(room.roomScale[0]*18>fit.distance);assert.ok(room.roomScale[2]*20>fit.distance);const camera=new T.PerspectiveCamera(40,aspect,.05,4e6);camera.position.copy(fit.target).add(new T.Vector3(1,.65,1.3).normalize().multiplyScalar(fit.distance));camera.lookAt(fit.target);camera.updateMatrixWorld();
   for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const projected=new T.Vector3(x,y,z).project(camera);assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1,`${type}: all corners fit ${aspect}`);}
  }
 }
});

test('Translated tall and wide craft fit the room, platform and grid; deletion restores baseline',()=>{
 const bounds=new T.Box3(new T.Vector3(90,-80,-40),new T.Vector3(170,150,60)),before=bounds.clone(),layout=workshopLayout(bounds);
 assert.deepEqual(bounds,before);assert.equal(layout.origin[1],-80.2);
 assert.ok(18*layout.roomScale[0]>40);assert.ok(20*layout.roomScale[2]>50);assert.ok(19*layout.roomScale[1]+layout.origin[1]>bounds.max.y);
 assert.ok(layout.platformScale*4.9>Math.hypot(40,50));assert.ok(layout.gridSize>=130);
 assert.deepEqual(workshopLayout(new T.Box3()),{origin:[0,0,0],roomScale:[1,1,1],platformScale:1,gridSize:80});assert.equal(workshopFrame(new T.Box3(),40,1),null);
});

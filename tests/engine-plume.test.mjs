import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createEnginePlume} from '../dist/engine-plume.js';
import {PARTS} from '../dist/catalog.js';
test('Plume stays anchored to the nozzle exit when length changes and gimbal rotates',()=>{
 const d=PARTS.engine,pivot=new T.Group();pivot.position.fromArray(d.gimbalPivot);const plume=createEnginePlume(d,true);pivot.add(plume);
 for(const angle of [0,.1])for(const length of [.5,1.5]){pivot.rotation.x=angle;plume.scale.y=length;pivot.updateMatrixWorld(true);const expected=new T.Vector3(0,-d.size[1]/2-d.gimbalPivot[1],0).applyMatrix4(pivot.matrixWorld),actual=plume.localToWorld(new T.Vector3());assert.ok(actual.distanceTo(expected)<1e-9);plume.geometry.computeBoundingBox();assert.ok(Math.abs(plume.geometry.boundingBox.max.y)<1e-6);assert.ok(plume.geometry.boundingBox.min.y<0);}
 assert.equal(plume.material.depthTest,true);assert.equal(plume.material.depthWrite,false);assert.equal(plume.material.toneMapped,false);plume.geometry.dispose();plume.material.dispose();
});

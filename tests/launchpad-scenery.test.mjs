import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {addLaunchpad} from '../dist/launchpad-scenery.js';
import {PLANET,center} from '../dist/planet.js';
import {fixedToInertial,surfaceOrientation} from '../dist/surface-frame.js';
test('launch complex has bounded geometry, an unobstructed flush deck and co-rotates with the launch site',async()=>{
 const data=await readFile(new URL('../dist/assets/scenery/launchpad.glb',import.meta.url));
 const {scene}=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
 let count=0,triangles=0;scene.traverse(o=>{if(!o.isMesh)return;count++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const name of ['position','normal'])assert.ok([...o.geometry.attributes[name].array].every(Number.isFinite));});
 assert.ok(count<=16);assert.ok(triangles<100000);
 const bounds=new T.Box3().setFromObject(scene),size=bounds.getSize(new T.Vector3());assert.ok(size.x>70&&size.z>100&&size.y>40&&size.y<43);
 const ray=new T.Raycaster();for(const x of [-6,0,6])for(const z of [-6,0,6]){ray.set(new T.Vector3(x,45,z),new T.Vector3(0,-1,0));const hits=ray.intersectObject(scene,true);assert.ok(hits.length);assert.ok(hits[0].point.y>=0&&hits[0].point.y<.1,`deck ${x},${z}: ${hits[0].point.y}`);}
 const parent=new T.Group(),pad=addLaunchpad(parent,scene);assert.equal(parent.children.length,1);assert.equal(pad.children.filter(o=>o.isPointLight).length,3);
 pad.traverse(o=>{if(o.isMesh)assert.equal(o.userData.sharedAsset,true);});
 for(const time of [0,193310]){parent.position.copy(center);parent.quaternion.copy(surfaceOrientation(time));parent.updateMatrixWorld(true);assert.ok(pad.getWorldPosition(new T.Vector3()).distanceTo(fixedToInertial(new T.Vector3(0,PLANET.radius,0),time))<1e-8);}
 assert.equal(addLaunchpad(parent,null),null);
});

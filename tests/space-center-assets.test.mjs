import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {Box3,Vector3} from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
test('detailed campus retains launch-complex scale and bounded rendering cost',async()=>{
 const data=await readFile(new URL('../dist/assets/scenery/space-center.glb',import.meta.url));
 const {scene}=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
 let meshes=0,triangles=0,pad;
 scene.traverse(o=>{if(o.userData.facility==='pad')pad=o;if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
 assert.ok(meshes<100,`mesh count ${meshes}`);assert.ok(triangles<180000,`triangles ${triangles}`);
 const bounds=new Box3().setFromObject(pad),size=bounds.getSize(new Vector3());
 assert.ok(size.x>70&&size.z>100&&size.y>40&&size.y<43);
 assert.ok(bounds.min.x>45&&bounds.max.x<170);
 assert.ok(data.byteLength<8_000_000);
});
test('Blender campus has selectable facility roots with finite nonempty geometry',async()=>{const data=await readFile(new URL('../dist/assets/scenery/space-center.glb',import.meta.url));const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');const facilities=new Map();gltf.scene.traverse(o=>{if(o.userData.facility)facilities.set(o.userData.facility,o);if(o.isMesh)for(const name of ['position','normal']){assert.ok(o.geometry.getAttribute(name));assert.ok([...o.geometry.getAttribute(name).array].every(Number.isFinite));}});assert.deepEqual([...facilities.keys()].sort(),['pad','runway','sph','tracking','vab']);for(const o of facilities.values()){const size=new Box3().setFromObject(o).getSize(new Vector3());assert.ok(size.x>10&&size.y>(o.userData.facility==='runway'?.1:5)&&size.z>10);}assert.ok(new Box3().setFromObject(facilities.get('vab')).getSize(new Vector3()).y>60);});

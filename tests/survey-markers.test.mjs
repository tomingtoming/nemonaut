import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {addSurveyMarkers} from '../dist/survey-markers.js';
import {DELIVERY_SITES,deliverySitePosition} from '../dist/delivery-sites.js';
import {surfaceOrientation,PRIMARY_ROTATION_PERIOD} from '../dist/surface-frame.js';
import {center,PLANET} from '../dist/planet.js';
test('Blender survey marks match the physical 30m site and stay surface-fixed through rotation',async()=>{
 const assets=new Map();for(const id of ['north','east']){
  const data=await readFile(new URL('../dist/assets/scenery/survey-'+id+'.glb',import.meta.url));const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');assets.set('survey-'+id,gltf.scene);
  const b=new T.Box3().setFromObject(gltf.scene);assert.ok(b.min.y>=.029&&b.max.y<.07);assert.ok(b.max.x<=30.001&&b.min.x>=-30.001);assert.ok(b.max.z<=30.001&&b.min.z>=-30.001);
  let triangles=0;gltf.scene.traverse(o=>{if(o.isMesh){for(const name of ['position','normal']){assert.ok(o.geometry.attributes[name]);for(const n of o.geometry.attributes[name].array)assert.ok(Number.isFinite(n));}triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});assert.ok(triangles>0&&triangles<10000);
 }
 const parent=new T.Group();parent.position.copy(center);const markers=addSurveyMarkers(parent,assets);assert.equal(markers.length,DELIVERY_SITES.length);
 for(const time of [0,PRIMARY_ROTATION_PERIOD/4,PRIMARY_ROTATION_PERIOD*.91]){
  parent.quaternion.copy(surfaceOrientation(time));parent.updateMatrixWorld(true);
  for(const marker of markers){const site=DELIVERY_SITES.find(s=>s.id===marker.userData.siteId),origin=marker.getWorldPosition(new T.Vector3()),up=new T.Vector3(0,1,0).applyQuaternion(marker.getWorldQuaternion(new T.Quaternion()));assert.ok(origin.distanceTo(deliverySitePosition(time,site))<1e-7);assert.ok(up.dot(origin.clone().sub(center).normalize())>.999999);
   marker.traverse(o=>{if(o.isMesh){assert.equal(o.userData.sharedAsset,true);const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);const altitude=v.distanceTo(center)-PLANET.radius;assert.ok(altitude>.02&&altitude<.08);}}});
  }
 }
});

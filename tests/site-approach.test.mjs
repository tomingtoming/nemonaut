import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {siteApproach,siteApproachText} from '../dist/site-approach.js';
import {DELIVERY_SITES,deliveryDistance,deliverySitePosition} from '../dist/delivery-sites.js';
import {PRIMARY,MOON,bodyState} from '../dist/celestial.js';
import {fixedToInertial,surfaceVelocity,surfaceOrientation} from '../dist/surface-frame.js';

test('approach speed matches changing surface distance at different epochs and heights',()=>{
 for(const time of [0,74193.2])for(const height of [2,400,10000])for(const site of DELIVERY_SITES){
  const fixed=new T.Vector3(0,PRIMARY.radius+height,0),position=fixedToInertial(fixed,time);
  for(const motion of [new T.Vector3(10,3,4),new T.Vector3(-10,-5,-4),new T.Vector3(0,20,0)]){
   const relative=motion.clone().applyQuaternion(surfaceOrientation(time));
   const v={pos:position,q:new T.Quaternion(),stats:{com:new T.Vector3()},vel:surfaceVelocity(position,time).add(relative),universalTime:time};
   const d=siteApproach(v,site),dt=.01;
   const next=fixedToInertial(fixed.clone().addScaledVector(motion,dt),time+dt);
   const numerical=(deliveryDistance(position,time,site)-deliveryDistance(next,time+dt,site))/dt;
   assert.ok(Math.abs(d.closing-numerical)<.015,`${d.closing} vs ${numerical}`);
   assert.ok(Math.abs(d.horizontal-Math.hypot(motion.x,motion.z)*PRIMARY.radius/(PRIMARY.radius+height))<1e-8);
  }
 }
});

test('stationary overhead is finite, recession is named, lunar positions have no surface guidance',()=>{
 const site=DELIVERY_SITES[0],time=100,position=deliverySitePosition(time,site);
 const v={pos:position,q:new T.Quaternion(),stats:{com:new T.Vector3()},vel:surfaceVelocity(position,time),universalTime:time};
 assert.equal(siteApproach(v,site).closing,null);
 assert.equal(siteApproachText(v,site),'目標上空 · 水平 0.0 m/s');
 v.pos=fixedToInertial(new T.Vector3(0,PRIMARY.radius+300,0),time);
 v.vel=surfaceVelocity(v.pos,time).add(new T.Vector3(-10,0,0));
 assert.match(siteApproachText(v,site),/^離脱 10.0 m\/s/);
 v.pos=bodyState(MOON,time).position.clone().add(new T.Vector3(0,MOON.radius+100,0));
 assert.equal(siteApproach(v,site),null);assert.equal(siteApproachText(v,site),'');
});

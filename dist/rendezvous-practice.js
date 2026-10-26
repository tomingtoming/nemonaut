import * as T from 'three';
import {Flight} from './core.js';
import {preset} from './catalog.js';
import {center} from './planet.js';
import {centerOfVessel,setTarget} from './relative-navigation.js';
import {loadFlight,saveFlight} from './flight-save.js';
import {flightFromWorld,worldFromFlight} from './world-save.js';

// Initial conditions only. Both vessels subsequently use ordinary fleet physics.
export function withRendezvousTarget(world){
 const own=loadFlight(flightFromWorld(world));
 try{
  if(own.environment!=='orbit'||own.detached.length)throw Error('移送練習は単独機の母星円軌道から開始してください');
  const target=new Flight(preset('orbital-tug'),'orbit',own.universalTime);
  own.detached.push(target);
  const radius=centerOfVessel(own).sub(center);
  const rotation=new T.Quaternion().setFromAxisAngle(radius.clone().cross(own.vel).normalize(),.03);
  target.pos.copy(radius.applyQuaternion(rotation).add(center).sub(target.stats.com.clone().applyQuaternion(target.q)));
  target.vel.copy(own.vel).applyQuaternion(rotation);
  target.vesselName='移送先 · Orbital Tug';
  setTarget(own,own,target);
  return worldFromFlight(saveFlight(own,world.flightMeta),{history:world.history});
 }finally{own.dispose();}
}

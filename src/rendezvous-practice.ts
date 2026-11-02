import * as T from 'three';
import {portPose} from './port-navigation.js';
import {partRotation} from './aero.js';
import {Flight} from './core.js';
import {PARTS,preset,type PartCatalog} from './catalog.js';
import {center} from './planet.js';
import {centerOfVessel,setTarget} from './relative-navigation.js';
import {loadFlight,saveFlight} from './flight-save.js';
import {flightFromWorld,worldFromFlight,type SavedWorld} from './world-save.js';

// Initial conditions only. Both vessels subsequently use ordinary fleet physics.
export function withRendezvousTarget(world:SavedWorld,{close=false}:{close?:boolean}={}):SavedWorld{
 const own=loadFlight(flightFromWorld(world)!);
 try{
  if(own.environment!=='orbit'||own.detached.length)throw Error('移送練習は単独機の母星円軌道から開始してください');
  const target=new Flight(preset('orbital-tug'),'orbit',own.universalTime);
  own.detached.push(target);
  const radius=centerOfVessel(own).sub(center);
  const rotation=new T.Quaternion().setFromAxisAngle(radius.clone().cross(own.vel).normalize(),.03);
  target.pos.copy(radius.applyQuaternion(rotation).add(center).sub(target.stats.com.clone().applyQuaternion(target.q)));
  target.vel.copy(own.vel).applyQuaternion(rotation);
  target.vesselName=close?'接続先 · Orbital Tug':'移送先 · Orbital Tug';
  setTarget(own,own,target);
  if(close){
   const a=own.parts.find(p=>(PARTS as PartCatalog)[p.type].docking&&!p.dockPartner),b=target.parts.find(p=>(PARTS as PartCatalog)[p.type].docking&&!p.dockPartner);
   if(!a||!b)throw Error('空いているドッキングポートが必要です');
   const pose=portPose(own,a.id)!;target.q.copy(pose.q).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI)).multiply(partRotation(b).invert());
   target.pos.add(pose.position.clone().addScaledVector(pose.normal,20).sub(portPose(target,b.id)!.position));target.vel.copy(own.vel);target.holdQ=target.q.clone();target.sasMode='hold';
   own.dockingPorts={own:a.id,target:b.id};own.portTranslationEnabled=true;
  }
  return worldFromFlight(saveFlight(own,world.flightMeta),{history:world.history});
 }finally{own.dispose();}
}

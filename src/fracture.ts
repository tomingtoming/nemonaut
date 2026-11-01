import * as T from 'three';
import {PARTS} from './catalog.js';
import {normalizeSymmetry} from './symmetry.js';
import {fuelNetworks} from './resources.js';
import {bodyOrbitState} from './celestial.js';

export function fractureComponents(parts,failedIds){
 const failed=new Set(failedIds),byId=new Map(parts.map(p=>[p.id,p])),groups=new Map();
 for(const p of parts){
  let root=p;
  if(!failed.has(p.id))while(root.parent&&byId.has(root.parent)&&!failed.has(root.parent))root=byId.get(root.parent);
  const key=failed.has(p.id)?p.id:root.id;
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(structuredClone(p));
 }
 return [...groups.values()].map(group=>{
  const ids=new Set(group.map(p=>p.id));
  for(const p of group){if(!ids.has(p.parent)){p.parent=null;delete p.attachment;}if(!ids.has(p.dockPartner))delete p.dockPartner;}
  return {parts:normalizeSymmetry(group),wreck:failed.has(group[0].id)};
 });
}

// The caller invokes this after the solver step, never while iterating colliders.
export function fractureVessel(f,failedIds,createFlight,statistics){
 if(f.failureDynamics||!failedIds.length)return;
 const components=fractureComponents(f.parts,failedIds);
 const priority=c=>c.parts.some(p=>PARTS[p.type].control)?(c.wreck?1:2):(c.wreck?-1:0);
 components.sort((a,b)=>priority(b)-priority(a)||b.parts.length-a.parts.length);
 const before={...f,stats:statistics(f.parts,f.fuel,f.ballast,f.thermal),pos:f.pos.clone(),vel:f.vel.clone(),q:f.q.clone(),omega:f.omega.clone()};
 const oldCenter=before.stats.com.clone().applyQuaternion(before.q),children=[];
 const initialize=(v,component)=>{
  const ids=new Set(component.parts.map(p=>p.id));v.parts=component.parts;
  for(const key of ['fuel','charge','thermal','chutes','observations','deflections','gimbals','wheelMotion'])v[key]=new Map([...before[key]].filter(([id])=>ids.has(id)).map(([id,s])=>[id,s?.isVector3?s.clone():structuredClone(s)]));
  for(const key of ['time','universalTime','environment','stage','started','ballast','trim','brake','navigationFrame','navigationAuto','reactionEnabled','steeringEnabled','driveEnabled','rcsEnabled'])v[key]=before[key];
  v.failureEvents=structuredClone(before.failureEvents);v.failureDynamics=component.wreck;v.crashed=component.wreck;
  v.throttle=0;v.lastThrust=0;v.engineThrust=new Map();v.rcsJets=[];v.sas=!component.wreck&&before.sas;v.sasMode='hold';v.holdQ=before.q.clone();v.maneuver=null;v.transferGuide=null;v.dockingPorts=null;v.portTranslationEnabled=false;
  v.active=new Set([...before.active].filter(id=>ids.has(id)&&!component.wreck));
  if(component.wreck){v.rcsEnabled=false;v.reactionEnabled=false;v.driveEnabled=false;v.steeringEnabled=false;for(const id of v.fuel.keys())v.fuel.set(id,0);}
  v.stats=statistics(v.parts,v.fuel,v.ballast,v.thermal);v.pos.copy(before.pos);v.q.copy(before.q);v.omega.copy(before.omega);
  v.vel.copy(before.vel).add(before.omega.clone().cross(v.stats.com.clone().applyQuaternion(v.q).sub(oldCenter)));
  v.landed=false;v.landedTime=0;v.physicsOrigin=null;v.networks=fuelNetworks(v.parts);v.buildColliders();
  v.orbit=bodyOrbitState(v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q)),v.vel,v.universalTime);
 };
 for(const component of components.slice(1)){const child=createFlight(component.parts,before.environment,before.universalTime);initialize(child,component);child.vesselName=(before.vesselName+' / '+(component.wreck?'残骸':'分裂')+' '+(++f.separationCount)).slice(0,80);children.push(child);}
 initialize(f,components[0]);f.detached.push(...children);
}

import {portPose} from './port-navigation.js';
export {portPose} from './port-navigation.js';
import * as T from 'three';
import {PARTS} from './catalog.js';
import {partRotation,partMass,partCenter} from './aero.js';
import {centerOfVessel,resolveTargets} from './relative-navigation.js';
import {Flight,statistics,descendants,validateCraft} from './core.js';
import {fleet} from './fleet.js';
import {fuelNetworks} from './resources.js';
import {bodyOrbitState} from './celestial.js';
export const DOCK_LIMITS={distance:.15,angle:8*Math.PI/180,speed:.3,angularSpeed:.15};
export function dockingStatus(a,aId,b,bId){
 const invalid=reason=>({ready:false,reason});
 if(a===b)return invalid('同じ機体です');if(a.crashed||b.crashed)return invalid('損傷した機体です');
 if((a.environment==='water')!==(b.environment==='water'))return invalid('海面と地上の環境は結合できません');
 if(a.ballast!==b.ballast&&[...a.parts,...b.parts].some(p=>PARTS[p.type].ballast))return invalid('結合前に両機のバラスト設定を合わせてください');
 const pa=portPose(a,aId),pb=portPose(b,bId);if(!pa||!pb)return invalid('ポートが見つかりません');
 if(pa.part.dockPartner||pb.part.dockPartner)return invalid('使用中のポートです');
 const distance=pa.position.distanceTo(pb.position),angle=Math.acos(T.MathUtils.clamp(-pa.normal.dot(pb.normal),-1,1)),speed=pa.velocity.distanceTo(pb.velocity),angularSpeed=a.omega.distanceTo(b.omega);
 const reason=distance>DOCK_LIMITS.distance?'ポートが離れています':angle>DOCK_LIMITS.angle?'結合面が向き合っていません':speed>DOCK_LIMITS.speed?'接触点の相対速度が高すぎます':angularSpeed>DOCK_LIMITS.angularSpeed?'相対回転が速すぎます':'';
 return {ready:!reason,reason,distance,angle,speed,angularSpeed};
}

// Match the cuboid / wheel-sphere mass model used by the Rapier colliders.
export function inertiaAbout(v,point){const tensor=new T.Matrix3().set(0,0,0,0,0,0,0,0,0);for(const p of v.parts){const d=PARTS[p.type],m=partMass(p,v.fuel,v.ballast,v.thermal),[x,y,z]=d.size.map(n=>Math.max(.04,n)),q=v.q.clone().multiply(partRotation(p)),r=new T.Matrix3().setFromMatrix4(new T.Matrix4().makeRotationFromQuaternion(q)),sphere=.4*m*.35**2,local=new T.Matrix3().set(d.wheel?sphere:m*(y*y+z*z)/12,0,0,0,d.wheel?sphere:m*(x*x+z*z)/12,0,0,0,d.wheel?sphere:m*(x*x+y*y)/12),world=r.clone().multiply(local).multiply(r.clone().transpose()),offset=partCenter(p).applyQuaternion(v.q).add(v.pos).sub(point),a=offset.toArray(),s=offset.lengthSq();for(let i=0;i<3;i++)for(let j=0;j<3;j++)tensor.elements[j*3+i]+=world.elements[j*3+i]+m*((i===j?s:0)-a[i]*a[j]);}return tensor;}
export function combinedMotion(a,b){const vessels=[a,b],masses=vessels.map(v=>v.parts.reduce((s,p)=>s+partMass(p,v.fuel,v.ballast,v.thermal),0)),centers=vessels.map(centerOfVessel),mass=masses[0]+masses[1],center=centers[0].clone().multiplyScalar(masses[0]).addScaledVector(centers[1],masses[1]).divideScalar(mass),momentum=new T.Vector3(),angularMomentum=new T.Vector3(),inertia=new T.Matrix3().set(0,0,0,0,0,0,0,0,0);vessels.forEach((v,i)=>{const linear=v.vel.clone().multiplyScalar(masses[i]);momentum.add(linear);angularMomentum.add(v.omega.clone().applyMatrix3(inertiaAbout(v,centers[i]))).add(centers[i].clone().sub(center).cross(linear));const tensor=inertiaAbout(v,center);tensor.elements.forEach((n,j)=>inertia.elements[j]+=n);});return {mass,center,velocity:momentum.clone().divideScalar(mass),omega:angularMomentum.clone().applyMatrix3(inertia.clone().invert()),momentum,angularMomentum,inertia};}

function rebuilt(source,parts,sources=[source]){
 validateCraft({version:1,parts});const out=new Flight(parts,source.environment),ids=new Set(parts.map(p=>p.id));out.transferGuide=null;
 for(const key of ['vesselName','time','universalTime','stage','started','ballast','trim','brake','reactionEnabled','steeringEnabled','driveEnabled','rcsEnabled','maxAltitude'])out[key]=source[key];
 out.pos.copy(source.pos);out.q.copy(source.q);out.vel.copy(source.vel);out.omega.copy(source.omega);out.holdQ=source.q.clone();out.sas=parts.some(p=>PARTS[p.type].control)&&source.sas;out.sasMode='hold';out.throttle=0;out.maneuver=null;out.targetPartId=source.targetPartId;
 for(const key of ['fuel','charge','thermal','chutes','deflections','gimbals','wheelMotion'])out[key]=new Map(sources.flatMap(v=>[...v[key]]).filter(([id])=>ids.has(id)).map(([id,value])=>[id,value?.isVector3?value.clone():structuredClone(value)]));
 out.active=new Set(sources.flatMap(v=>[...v.active]).filter(id=>ids.has(id)));out.networks=fuelNetworks(out.parts);out.stats=statistics(out.parts,out.fuel,out.ballast,out.thermal);out.buildColliders();return out;
}
function updateOrbit(v){v.orbit=bodyOrbitState(centerOfVessel(v),v.vel,v.universalTime);}
function replaceFleet(root,removed,replacement,extras=[]){const others=fleet(root).filter(v=>!removed.includes(v));for(const v of [...others,...removed])v.detached=[];replacement.detached=[...others,...extras];resolveTargets(replacement);for(const v of removed)v.dispose();return replacement;}

export function dockVessels(root,target,rootPort,targetPort){
 if(!fleet(root).includes(target))throw Error('現在の飛行に含まれない機体です');const status=dockingStatus(root,rootPort,target,targetPort);if(!status.ready)throw Error(status.reason);
 if(root.parts.length+target.parts.length>400)throw Error('結合後の部品数が上限を超えます');
 const parts=structuredClone(root.parts),incoming=structuredClone(target.parts),inverse=root.q.clone().invert(),relative=inverse.clone().multiply(target.q),offset=target.pos.clone().sub(root.pos).applyQuaternion(inverse),byId=new Map(incoming.map(p=>[p.id,p]));
 // Reverse the path from the incoming port to its old root, preserving every edge.
 let current=byId.get(targetPort),parent=current.parent;current.parent=rootPort;
 while(parent){const next=byId.get(parent),previous=next.parent;next.parent=current.id;current=next;parent=previous;}
 for(const p of incoming){p.p=new T.Vector3(...p.p).applyQuaternion(relative).add(offset).toArray();const e=new T.Euler().setFromQuaternion(relative.clone().multiply(partRotation(p)));p.r=[e.x,e.y,e.z];}
 parts.find(p=>p.id===rootPort).dockPartner=targetPort;byId.get(targetPort).dockPartner=rootPort;parts.push(...incoming);
 const motion=combinedMotion(root,target),merged=rebuilt(root,parts,[root,target]);merged.vesselId=root.vesselId;merged.vel.copy(motion.velocity);merged.omega.copy(motion.omega);updateOrbit(merged);
 return replaceFleet(root,[root,target],merged);
}
export function undockVessel(root,portId){
 const port=root.parts.find(p=>p.id===portId),partner=root.parts.find(p=>p.id===port?.dockPartner);if(!port||!partner||partner.dockPartner!==port.id)throw Error('結合済みポートを選んでください');
 const childPort=port.parent===partner.id?port:partner.parent===port.id?partner:null;if(!childPort)throw Error('ポート間の接続が不正です');
 const ids=descendants(root.parts,childPort.id),parts=structuredClone(root.parts);for(const p of parts){if(p.id===port.id||p.id===partner.id)delete p.dockPartner;if(p.id===childPort.id)p.parent=null;}
 const retained=parts.filter(p=>!ids.has(p.id)),branch=parts.filter(p=>ids.has(p.id)),before=centerOfVessel(root),a=rebuilt(root,retained),b=rebuilt(root,branch);
 a.vesselId=root.vesselId;for(const v of [a,b])v.vel.copy(root.vel).add(root.omega.clone().cross(centerOfVessel(v).sub(before)));
 // Equal-and-opposite impulses through the COM line preserve total angular momentum.
 const direction=centerOfVessel(b).sub(centerOfVessel(a));if(direction.lengthSq()>1e-10){direction.normalize();const impulse=.1/(1/a.stats.mass+1/b.stats.mass);a.vel.addScaledVector(direction,-impulse/a.stats.mass);b.vel.addScaledVector(direction,impulse/b.stats.mass);}
 updateOrbit(a);updateOrbit(b);return replaceFleet(root,[root],a,[b]);
}

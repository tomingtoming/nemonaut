import * as T from 'three';
import {PARTS} from './catalog.js';
export function containingCargoBay(parts,p){
 const seen=new Set();let current=p;
 while(current?.parent&&!seen.has(current.id)){
  seen.add(current.id);current=parts.find(q=>q.id===current.parent);
  if(current&&PARTS[current.type].cargoBay){
   const local=new T.Vector3(...p.p).sub(new T.Vector3(...current.p)).applyQuaternion(new T.Quaternion().setFromEuler(new T.Euler(...current.r)).invert());
   const d=PARTS[current.type];
   if(local.toArray().every((v,i)=>Math.abs(v)<d.size[i]/2))return current;
  }
 }
 return null;
}
export function cargoReleaseAllowed(parts,p){const bay=containingCargoBay(parts,p);return !bay||bay.cargoOpen===true;}
export function cargoReleaseDirection(parts,p){const bay=containingCargoBay(parts,p);return bay?new T.Vector3(0,0,1).applyQuaternion(new T.Quaternion().setFromEuler(new T.Euler(...bay.r))):null;}

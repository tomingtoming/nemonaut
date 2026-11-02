import * as T from 'three';
import {PARTS,type Part} from './catalog.js';
export function containingCargoBay(parts:readonly Part[],p:Part):Part|null{
 const seen=new Set<string>();let current:Part|undefined=p;
 while(current?.parent&&!seen.has(current.id)){
  seen.add(current.id);current=parts.find(q=>q.id===current!.parent);
  if(current&&PARTS[current.type].cargoBay){
   const local=new T.Vector3(...p.p).sub(new T.Vector3(...current.p)).applyQuaternion(new T.Quaternion().setFromEuler(new T.Euler(...current.r)).invert());
   const d=PARTS[current.type];
   if(local.toArray().every((v,i)=>Math.abs(v)<d.size[i]/2))return current;
  }
 }
 return null;
}
export function cargoReleaseAllowed(parts:readonly Part[],p:Part):boolean{const bay=containingCargoBay(parts,p);return !bay||bay.cargoOpen===true;}
export function cargoReleaseDirection(parts:readonly Part[],p:Part):T.Vector3|null{const bay=containingCargoBay(parts,p);return bay?new T.Vector3(0,0,1).applyQuaternion(new T.Quaternion().setFromEuler(new T.Euler(...bay.r))):null;}

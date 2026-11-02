import {validPartSetting,type SettablePart} from './part-settings.js';
import * as T from 'three';

/** Part fields read by symmetry grouping; `symmetryFrame` is a 16-number column-major Matrix4. */
export interface SymmetryPart{id:string;type:string;symmetryGroup?:string;symmetryFrame?:number[]}
export function validateSymmetry(parts:readonly SymmetryPart[]):void{
 const types=new Map<string,string>();
 for(const p of parts){
  const g=p.symmetryGroup;if(g===undefined){if(p.symmetryFrame!==undefined)throw Error('対称軸にグループがありません');continue;}
  if(typeof g!=='string'||!g.trim()||g.length>200)throw Error('対称グループが不正です');
  if(types.has(g)&&types.get(g)!==p.type)throw Error('対称グループの部品種類が異なります');
  types.set(g,p.type);
  if(p.symmetryFrame!==undefined){
   const a=p.symmetryFrame;
   if(!Array.isArray(a)||a.length!==16||a.some(n=>!Number.isFinite(n)||Math.abs(n)>1e7)||[3,7,11].some(i=>Math.abs(a[i])>1e-8)||Math.abs(a[15]-1)>1e-8)throw Error('対称軸が不正です');
   const axes=[0,4,8].map(i=>new T.Vector3(a[i],a[i+1],a[i+2]));
   if(axes.some(v=>Math.abs(v.lengthSq()-1)>1e-7)||Math.abs(axes[0].dot(axes[1]))>1e-7||Math.abs(axes[0].dot(axes[2]))>1e-7||Math.abs(axes[1].dot(axes[2]))>1e-7)throw Error('対称軸の倍率・角度が不正です');
  }
 }
}
export function symmetryTargets<P extends SymmetryPart=SettablePart>(parts:readonly P[],id:string,linked=true):P[]{
 const p=parts.find(p=>p.id===id);if(!p)throw Error('部品が見つかりません');
 return linked&&p.symmetryGroup?parts.filter(q=>q.symmetryGroup===p.symmetryGroup&&q.type===p.type):[p];
}
// Mutates only the owned copy supplied by editing/launch operations.
export function normalizeSymmetry<A extends SymmetryPart[]>(parts:A,{fresh=false}:{fresh?:boolean}={}):A{
 const groups=new Map<string,SymmetryPart[]>();for(const p of parts)if(p.symmetryGroup){if(!groups.has(p.symmetryGroup))groups.set(p.symmetryGroup,[]);groups.get(p.symmetryGroup)!.push(p);}
 for(const members of groups.values()){
  if(members.length<2){delete members[0].symmetryGroup;delete members[0].symmetryFrame;continue;}
  if(fresh){const id=crypto.randomUUID();for(const p of members)p.symmetryGroup=id;}
 }
 return parts;
}
export function hasSymmetryGeometry(parts:readonly SymmetryPart[],id:string):boolean{const group=symmetryTargets(parts,id);return group.length>1&&group.every(p=>p.symmetryFrame!==undefined);}
export function placementSymmetryFrame(mode:string,bay:string,index:number,count:number):T.Matrix4Tuple{
 return (mode==='mirror'?new T.Matrix4().makeScale(index?-1:1,1,1):new T.Matrix4().makeRotationAxis(bay==='vab'?new T.Vector3(0,1,0):new T.Vector3(0,0,1),index*2*Math.PI/count)).toArray();
}
export function transformSymmetryFrames(parts:readonly Pick<SymmetryPart,'symmetryFrame'>[],delta:T.Matrix4):void{for(const p of parts)if(p.symmetryFrame)p.symmetryFrame=delta.clone().multiply(new T.Matrix4().fromArray(p.symmetryFrame)).toArray();}
export function editSymmetrySetting<P extends SettablePart>(parts:P[],id:string,key:string,value:unknown,linked=true):P[]{
 validateSymmetry(parts);
 const copy=structuredClone(parts),targets=symmetryTargets(copy,id,linked);
 if(key==='stage'){if(!Number.isInteger(value)||(value as number)<0||(value as number)>9)throw Error('作動段が不正です');}
 else if(targets.some(p=>!validPartSetting(p,key,value)))throw Error('この部品では変更できない作動設定です');
 for(const p of targets)(p as SettablePart&Record<string,unknown>)[key]=value;
 return copy;
}

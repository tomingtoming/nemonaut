import {releaseDisplacedAttachments} from './attachment-nodes.js';
import * as T from 'three';
import {validateCraft,descendants} from './core.js';
import {symmetryTargets,hasSymmetryGeometry,transformSymmetryFrames} from './symmetry.js';

const matrix=p=>new T.Matrix4().compose(new T.Vector3(...p.p),new T.Quaternion().setFromEuler(new T.Euler(...p.r)),new T.Vector3(1,1,1));
export function editSymmetryPose(parts,id,{position,rotation},linked=true){
 const copy=validateCraft({version:1,parts}),selected=copy.find(p=>p.id===id);
 if(!selected)throw Error('部品が見つかりません');
 if(![position,rotation].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite)))throw Error('位置・回転が不正です');
 const targets=linked&&hasSymmetryGeometry(copy,id)?symmetryTargets(copy,id):[selected],targetIds=new Set(targets.map(p=>p.id));
 const branches=targets.map(p=>({p,ids:descendants(copy,p.id)})),seen=new Set();
 for(const {ids} of branches)for(const key of ids){if(seen.has(key))throw Error('対称部品の枝が重複しています。個別編集を選んでください');seen.add(key);}
 const delta=matrix({p:position,r:rotation}).multiply(matrix(selected).invert());
 const inverseFrame=targets.length>1?new T.Matrix4().fromArray(selected.symmetryFrame).invert():null;
 for(const {p,ids} of branches){
  const mapping=inverseFrame?new T.Matrix4().fromArray(p.symmetryFrame).multiply(inverseFrame):new T.Matrix4();
  const change=mapping.clone().multiply(delta).multiply(mapping.clone().invert());
  for(const q of copy)if(ids.has(q.id)){
   const pose=change.clone().multiply(matrix(q)),pos=new T.Vector3(),rot=new T.Quaternion(),scale=new T.Vector3();pose.decompose(pos,rot,scale);
   const e=new T.Euler().setFromQuaternion(rot);q.p=pos.toArray();q.r=[e.x,e.y,e.z];
   // The edited group's axis stays fixed; axes of nested groups travel with their parent.
   if(!targetIds.has(q.id))transformSymmetryFrames([q],change);
  }
 }
 return validateCraft({version:1,parts:releaseDisplacedAttachments(copy)});
}

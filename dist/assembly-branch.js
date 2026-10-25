import {assertNodeAttachments,releaseDisplacedAttachments} from './attachment-nodes.js';
import {normalizeSymmetry,transformSymmetryFrames} from './symmetry.js';
import * as T from 'three';
import {validateCraft,descendants} from './core.js';

const matrix=p=>new T.Matrix4().compose(new T.Vector3(...p.p),new T.Quaternion().setFromEuler(new T.Euler(...p.r)),new T.Vector3(1,1,1));
export function assemblyTree(parts){
 if(!parts.length)return [];
 const checked=validateCraft({version:1,parts}),children=new Map(),rows=[];
 for(const p of checked){const key=p.parent||null;if(!children.has(key))children.set(key,[]);children.get(key).push(p);}
 function visit(p,depth){const row={id:p.id,type:p.type,stage:p.stage,depth,count:1};rows.push(row);for(const child of children.get(p.id)||[])row.count+=visit(child,depth+1);return row.count;}
 for(const p of children.get(null)||[])visit(p,0);return rows;
}
export function extractBranch(parts,id){
 const checked=validateCraft({version:1,parts});if(!checked.some(p=>p.id===id))throw Error('複製する部品が見つかりません');
 const ids=descendants(checked,id),branch=checked.filter(p=>ids.has(p.id));
 for(const p of branch){if(p.id===id){p.parent=null;p.attachment={mode:'free'};}if(p.dockPartner&&!ids.has(p.dockPartner))delete p.dockPartner;}
 return {rootId:id,parts:validateCraft({version:1,parts:branch})};
}
export function placeBranch(parts,branch,{position,rotation,parent=null,attachment={mode:'free'}},makeId=()=>crypto.randomUUID()){
 if(parts.length)validateCraft({version:1,parts});
 const source=validateCraft({version:1,parts:branch.parts}),root=source.find(p=>p.id===branch.rootId);
 if(!root||root.parent||source.some(p=>p.id!==root.id&&!p.parent))throw Error('枝の接続が不正です');
 if(parts.length+source.length>400)throw Error('部品上限は400です。枝全体を配置できません');
 if(parent!==null&&!parts.some(p=>p.id===parent))throw Error('取付先が見つかりません');
 if(![position,rotation].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite)))throw Error('配置位置・回転が不正です');
 const delta=matrix({p:position,r:rotation}).multiply(matrix(root).invert()),used=new Set([...parts,...source].map(p=>p.id)),ids=new Map();
 for(const p of source){const id=makeId();if(typeof id!=='string'||!id||used.has(id))throw Error('新しい部品IDが重複しています');used.add(id);ids.set(p.id,id);}
 const created=source.map(p=>{const transform=delta.clone().multiply(matrix(p)),position=new T.Vector3(),q=new T.Quaternion(),scale=new T.Vector3();transform.decompose(position,q,scale);const e=new T.Euler().setFromQuaternion(q),copy={...p,id:ids.get(p.id),parent:p.id===root.id?parent:ids.get(p.parent),p:position.toArray(),r:[e.x,e.y,e.z]};if(p.dockPartner)copy.dockPartner=ids.get(p.dockPartner);return copy;});
 created.find(p=>p.id===ids.get(root.id)).attachment=structuredClone(attachment);assertNodeAttachments([...parts,...created],[ids.get(root.id)]);transformSymmetryFrames(created,delta);normalizeSymmetry(created,{fresh:true});const result=validateCraft({version:1,parts:[...parts,...created]});return {parts:result,rootId:ids.get(root.id),count:created.length};
}

export function moveBranch(parts,id,{position,rotation,parent=null,attachment={mode:'free'}}){
 const checked=validateCraft({version:1,parts}),root=checked.find(p=>p.id===id);
 if(!root)throw Error('付け替える部品が見つかりません');
 const ids=descendants(checked,id);
 if(parent!==null&&(!checked.some(p=>p.id===parent)||ids.has(parent)))throw Error('自分や子部品には接続できません。別の取付先を選んでください');
 if(![position,rotation].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite)))throw Error('配置位置・回転が不正です');
 const delta=matrix({p:position,r:rotation}).multiply(matrix(root).invert());
 for(const p of checked){
  // The old boundary docking bond must be removed on both sides.
  if(p.dockPartner&&ids.has(p.id)!==ids.has(p.dockPartner))delete p.dockPartner;
  if(!ids.has(p.id))continue;
  const transform=delta.clone().multiply(matrix(p)),pos=new T.Vector3(),q=new T.Quaternion(),scale=new T.Vector3();transform.decompose(pos,q,scale);
  const e=new T.Euler().setFromQuaternion(q);p.p=pos.toArray();p.r=[e.x,e.y,e.z];if(p.id===id)p.parent=parent;
 }
 root.attachment=structuredClone(attachment);assertNodeAttachments(checked,[id]);releaseDisplacedAttachments(checked);transformSymmetryFrames(checked.filter(p=>ids.has(p.id)),delta);normalizeSymmetry(checked.filter(p=>ids.has(p.id)),{fresh:true});normalizeSymmetry(checked.filter(p=>!ids.has(p.id)));return {parts:validateCraft({version:1,parts:checked}),rootId:id,count:ids.size};
}

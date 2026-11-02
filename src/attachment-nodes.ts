import * as T from 'three';
import {nodes,nodePoint,nodeAxis,type Part,type PartAttachment} from './catalog.js';
/** The part fields node attachment reads (a catalog Part satisfies it). */
export type NodePart=Pick<Part,'id'|'type'|'p'|'r'|'parent'|'attachment'>;
/** A node-to-node joint: parent part id and the node index used on each side. */
export interface NodeConnection{parent:string;parentNode:number;ownNode:number}
/** Node pose in the vessel frame. */
export interface NodePose{position:T.Vector3;normal:T.Vector3}
/** Occupied node endpoints (key(id,node)) → ids of the parts whose joints use them. */
export type OccupiedNodes=Map<string,string[]>;

const key=(id:string,node:number):string=>JSON.stringify([id,node]);
export function nodePose(part:Pick<Part,'type'|'p'|'r'>,index:number):NodePose{
 const n=nodes(part.type)[index];if(!n)throw Error('接続点が見つかりません');
 const q=new T.Quaternion().setFromEuler(new T.Euler(...part.r));
 return {position:new T.Vector3(...nodePoint(n)).applyQuaternion(q).add(new T.Vector3(...part.p)),normal:new T.Vector3(...nodeAxis(n)).applyQuaternion(q)};
}
function aligned(parent:NodePart,parentNode:number,child:NodePart,ownNode:number):boolean{const a=nodePose(parent,parentNode),b=nodePose(child,ownNode);return a.position.distanceToSquared(b.position)<1e-10&&a.normal.dot(b.normal)<-1+1e-6;}
export function validateAttachments(parts:readonly NodePart[]):void{
 const byId=new Map<string|null,NodePart>(parts.map(p=>[p.id,p]));
 for(const p of parts){const a=p.attachment;if(a===undefined)continue;
  if(!a||!['node','surface','free'].includes(a.mode))throw Error('取付方法が不正です');
  if(a.mode==='node'){
   const parent=byId.get(p.parent);
   const {ownNode,parentNode}=a;
    if(typeof ownNode!=='number'||!Number.isInteger(ownNode)||!nodes(p.type)[ownNode]||typeof parentNode!=='number'||!Number.isInteger(parentNode)||parentNode<0||(parent&&!nodes(parent.type)[parentNode]))throw Error('接続点の番号が不正です');
  }
 }
}
export function nodeConnection(parts:readonly NodePart[],child:NodePart):NodeConnection|null{
 const parent=parts.find(p=>p.id===child.parent);if(!parent)return null;
 const a=child.attachment;
 if(a){if(a.mode!=='node')return null;const {parentNode,ownNode}=a;if(parentNode===undefined||ownNode===undefined)throw Error('接続点が見つかりません');if(!aligned(parent,parentNode,child,ownNode))return null;return {parent:parent.id,parentNode,ownNode};}
 // Legacy designs have no attachment mode. Infer only one exact, opposing pair.
 const matches:NodeConnection[]=[];
 for(let i=0;i<nodes(parent.type).length;i++)for(let j=0;j<nodes(child.type).length;j++)if(aligned(parent,i,child,j))matches.push({parent:parent.id,parentNode:i,ownNode:j});
 return matches.length===1?matches[0]:null;
}
export function occupiedNodes(parts:readonly NodePart[],{ignoreEdges=new Set<string>()}:{ignoreEdges?:ReadonlySet<string>}={}):OccupiedNodes{
 const used=new Map<string,string[]>();
 for(const p of parts){if(ignoreEdges.has(p.id))continue;const c=nodeConnection(parts,p);if(!c)continue;
  for(const endpoint of [key(c.parent,c.parentNode),key(p.id,c.ownNode)]){let list=used.get(endpoint);if(!list){list=[];used.set(endpoint,list);}list.push(p.id);}
 }return used;
}
export function nodeAvailable(used:ReadonlyMap<string,readonly string[]>,id:string,index:number):boolean{return !used.has(key(id,index));}
export function bindMatchingNode<C extends NodePart>(parts:readonly NodePart[],child:C):C&{parent:string;attachment:PartAttachment}{
 const candidates:NodeConnection[]=[];
 for(const parent of parts){const probe={...child,parent:parent.id};delete probe.attachment;const c=nodeConnection([parent,probe],probe);if(c)candidates.push(c);}
 const preferred=candidates.filter(c=>c.parent===child.parent),matches=preferred.length?preferred:candidates;
 if(matches.length!==1)throw Error('対称の取付先を一意に決められません。各部品の位置に合う接続点が必要です');
 const c=matches[0];return {...child,parent:c.parent,attachment:{mode:'node',parentNode:c.parentNode,ownNode:c.ownNode}};
}
export function assertNodeAttachments<P extends NodePart=Part>(parts:readonly P[],ids:Iterable<string>):readonly P[]{
 validateAttachments(parts);const used=occupiedNodes(parts,{ignoreEdges:new Set(ids)});
 for(const id of ids){const p=parts.find(p=>p.id===id);if(!p||p.attachment?.mode!=='node')continue;
  const c=nodeConnection(parts,p);if(!c)throw Error('接続点が一致しません。対称の各部品に空いている接続点が必要です');
  for(const endpoint of [key(c.parent,c.parentNode),key(p.id,c.ownNode)]){if(used.has(endpoint))throw Error('この接続点は使用済みです。別の接続点を選んでください');used.set(endpoint,[id]);}
 }return parts;
}
// Transform edits may intentionally move a node-mounted branch away from its joint.
export function releaseDisplacedAttachments<P extends NodePart=Part>(parts:P[]):P[]{for(const p of parts)if(p.attachment?.mode==='node'&&!nodeConnection(parts,p))p.attachment={mode:'free'};return parts;}

import * as T from 'three';
import {nodes} from './catalog.js';

const key=(id,node)=>JSON.stringify([id,node]);
export function nodePose(part,index){
 const n=nodes(part.type)[index];if(!n)throw Error('接続点が見つかりません');
 const q=new T.Quaternion().setFromEuler(new T.Euler(...part.r));
 return {position:new T.Vector3(...n.slice(0,3)).applyQuaternion(q).add(new T.Vector3(...part.p)),normal:new T.Vector3(...n.slice(3)).applyQuaternion(q)};
}
function aligned(parent,parentNode,child,ownNode){const a=nodePose(parent,parentNode),b=nodePose(child,ownNode);return a.position.distanceToSquared(b.position)<1e-10&&a.normal.dot(b.normal)<-1+1e-6;}
export function validateAttachments(parts){
 const byId=new Map<any,any>(parts.map(p=>[p.id,p]));
 for(const p of parts){const a=p.attachment;if(a===undefined)continue;
  if(!a||!['node','surface','free'].includes(a.mode))throw Error('取付方法が不正です');
  if(a.mode==='node'){
   const parent=byId.get(p.parent);
   if(!Number.isInteger(a.ownNode)||!nodes(p.type)[a.ownNode]||!Number.isInteger(a.parentNode)||a.parentNode<0||(parent&&!nodes(parent.type)[a.parentNode]))throw Error('接続点の番号が不正です');
  }
 }
}
export function nodeConnection(parts,child){
 const parent=parts.find(p=>p.id===child.parent);if(!parent)return null;
 const a=child.attachment;
 if(a){if(a.mode!=='node'||!aligned(parent,a.parentNode,child,a.ownNode))return null;return {parent:parent.id,parentNode:a.parentNode,ownNode:a.ownNode};}
 // Legacy designs have no attachment mode. Infer only one exact, opposing pair.
 const matches=[];
 for(let i=0;i<nodes(parent.type).length;i++)for(let j=0;j<nodes(child.type).length;j++)if(aligned(parent,i,child,j))matches.push({parent:parent.id,parentNode:i,ownNode:j});
 return matches.length===1?matches[0]:null;
}
export function occupiedNodes(parts,{ignoreEdges=new Set()}={}){
 const used=new Map<any,any>();
 for(const p of parts){if(ignoreEdges.has(p.id))continue;const c=nodeConnection(parts,p);if(!c)continue;
  for(const endpoint of [key(c.parent,c.parentNode),key(p.id,c.ownNode)]){if(!used.has(endpoint))used.set(endpoint,[]);used.get(endpoint).push(p.id);}
 }return used;
}
export function nodeAvailable(used,id,index){return !used.has(key(id,index));}
export function bindMatchingNode(parts,child){
 const candidates=[];
 for(const parent of parts){const probe={...child,parent:parent.id};delete probe.attachment;const c=nodeConnection([parent,probe],probe);if(c)candidates.push(c);}
 const preferred=candidates.filter(c=>c.parent===child.parent),matches=preferred.length?preferred:candidates;
 if(matches.length!==1)throw Error('対称の取付先を一意に決められません。各部品の位置に合う接続点が必要です');
 const c=matches[0];return {...child,parent:c.parent,attachment:{mode:'node',parentNode:c.parentNode,ownNode:c.ownNode}};
}
export function assertNodeAttachments(parts,ids){
 validateAttachments(parts);const used=occupiedNodes(parts,{ignoreEdges:new Set(ids)});
 for(const id of ids){const p=parts.find(p=>p.id===id);if(!p||p.attachment?.mode!=='node')continue;
  const c=nodeConnection(parts,p);if(!c)throw Error('接続点が一致しません。対称の各部品に空いている接続点が必要です');
  for(const endpoint of [key(c.parent,c.parentNode),key(p.id,c.ownNode)]){if(used.has(endpoint))throw Error('この接続点は使用済みです。別の接続点を選んでください');used.set(endpoint,[id]);}
 }return parts;
}
// Transform edits may intentionally move a node-mounted branch away from its joint.
export function releaseDisplacedAttachments(parts){for(const p of parts)if(p.attachment?.mode==='node'&&!nodeConnection(parts,p))p.attachment={mode:'free'};return parts;}

import {PARTS} from './catalog.js';

export function validateSymmetry(parts){
 const types=new Map();
 for(const p of parts){
  const g=p.symmetryGroup;if(g===undefined)continue;
  if(typeof g!=='string'||!g.trim()||g.length>200)throw Error('対称グループが不正です');
  if(types.has(g)&&types.get(g)!==p.type)throw Error('対称グループの部品種類が異なります');
  types.set(g,p.type);
 }
}
export function symmetryTargets(parts,id,linked=true){
 const p=parts.find(p=>p.id===id);if(!p)throw Error('部品が見つかりません');
 return linked&&p.symmetryGroup?parts.filter(q=>q.symmetryGroup===p.symmetryGroup&&q.type===p.type):[p];
}
// Mutates only the owned copy supplied by editing/launch operations.
export function normalizeSymmetry(parts,{fresh=false}={}){
 const groups=new Map();for(const p of parts)if(p.symmetryGroup){if(!groups.has(p.symmetryGroup))groups.set(p.symmetryGroup,[]);groups.get(p.symmetryGroup).push(p);}
 for(const members of groups.values()){
  if(members.length<2){delete members[0].symmetryGroup;continue;}
  if(fresh){const id=crypto.randomUUID();for(const p of members)p.symmetryGroup=id;}
 }
 return parts;
}
export function editSymmetrySetting(parts,id,key,value,linked=true){
 validateSymmetry(parts);
 const copy=structuredClone(parts),targets=symmetryTargets(copy,id,linked);
 const allowed={reactionEnabled:d=>!!d.reactionTorque,steeringEnabled:d=>!!d.steer,driveEnabled:(_,p)=>p.type==='wheel'};
 if(key==='stage'){if(!Number.isInteger(value)||value<0||value>9)throw Error('作動段が不正です');}
 else if(!allowed[key]||typeof value!=='boolean'||targets.some(p=>!allowed[key](PARTS[p.type],p)))throw Error('この部品では変更できない作動設定です');
 for(const p of targets)p[key]=value;
 return copy;
}

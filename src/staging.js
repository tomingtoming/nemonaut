import {PARTS} from './catalog.js';

// Include empty slots: Space advances one integer, not one nonempty group.
export function stagePlan(parts){
 const actions=parts.flatMap(p=>{
  const d=PARTS[p.type],a=[];
  if(d.thrust)a.push({id:p.id,stage:p.stage,kind:'engine',label:'点火',effective:true});
  if(d.decoupler)a.push({id:p.id,stage:p.stage,kind:'separate',label:p.parent?'分離':'分離（親接続なし）',effective:!!p.parent});
  if(d.parachute)a.push({id:p.id,stage:p.stage,kind:'chute',label:'パラシュート待機',effective:true});
  return a;
 });
 if(!actions.length)return [];
 return Array.from({length:Math.max(...actions.map(a=>a.stage))+1},(_,stage)=>({stage,actions:actions.filter(a=>a.stage===stage)}));
}

export function moveStage(parts,from,direction){
 const to=from+direction;
 if(!Number.isInteger(from)||![-1,1].includes(direction)||from<0||from>9||to<0||to>9)throw Error('段は0〜9の範囲で移動できます');
 if(!stagePlan(parts).find(s=>s.stage===from)?.actions.length)throw Error('移動する作動部品がありません');
 // Swap every assignment, including passive parts, without changing topology.
 return parts.map(p=>({...structuredClone(p),stage:p.stage===from?to:p.stage===to?from:p.stage}));
}

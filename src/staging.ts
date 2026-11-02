import {PARTS,type PartCatalog,type Part} from './catalog.js';
/** The part fields staging reads (a catalog Part satisfies it). */
export type StagePart=Pick<Part,'id'|'type'|'stage'|'parent'>;
/** One staged action: engine ignition, separation or parachute arming. effective is false for a separator with no parent edge. */
export interface StageAction{id:string;stage:number;kind:'engine'|'separate'|'chute';label:string;effective:boolean}
/** One stage slot (possibly empty) of stagePlan. */
export interface StageSlot{stage:number;actions:StageAction[]}

// Include empty slots: Space advances one integer, not one nonempty group.
export function stagePlan(parts:readonly StagePart[]):StageSlot[]{
 const actions=parts.flatMap(p=>{
  const d=(PARTS as PartCatalog)[p.type],a:StageAction[]=[];
  if(d.thrust)a.push({id:p.id,stage:p.stage,kind:'engine',label:'点火',effective:true});
  if(d.decoupler)a.push({id:p.id,stage:p.stage,kind:'separate',label:p.parent?'分離':'分離（親接続なし）',effective:!!p.parent});
  if(d.parachute)a.push({id:p.id,stage:p.stage,kind:'chute',label:'パラシュート待機',effective:true});
  return a;
 });
 if(!actions.length)return [];
 return Array.from({length:Math.max(...actions.map(a=>a.stage))+1},(_,stage)=>({stage,actions:actions.filter(a=>a.stage===stage)}));
}

export function moveStage<P extends StagePart=Part>(parts:readonly P[],from:number,direction:number):P[]{
 const to=from+direction;
 if(!Number.isInteger(from)||![-1,1].includes(direction)||from<0||from>9||to<0||to>9)throw Error('段は0〜9の範囲で移動できます');
 if(!stagePlan(parts).find(s=>s.stage===from)?.actions.length)throw Error('移動する作動部品がありません');
 // Swap every assignment, including passive parts, without changing topology.
 return parts.map(p=>({...structuredClone(p),stage:p.stage===from?to:p.stage===to?from:p.stage}));
}

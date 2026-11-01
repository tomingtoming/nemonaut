import {PARTS} from './catalog.js';
import {stagePlan} from './staging.js';

// Forecast numbered commands on every controllable vessel. Each detached
// vessel inherits the current stage; later commands require selecting it.
export function stagingDiagnostics(parts,referenceId){
 const controls=parts.filter(p=>PARTS[p.type].control);
 const reference=controls.find(p=>p.id===referenceId)||controls[0];
 let vessels=[structuredClone(parts)];
 const separatedAt=new Map(),actions=[];
 for(const slot of stagePlan(parts)){
  const referenceVessel=vessels.find(v=>v.some(p=>p.id===reference?.id));
  for(const action of slot.actions){
   if(!action.effective)continue;
   const vessel=vessels.find(v=>v.some(p=>p.id===action.id));
   const controlIds=vessel.filter(p=>PARTS[p.type].control).map(p=>p.id);
   actions.push({...action,referenceId:reference?.id??null,controlIds,separatedAt:separatedAt.get(action.id)??null,status:!controlIds.length?'uncontrolled':vessel===referenceVessel?'reference':'switch'});
  }
  const next=[];
  for(const vessel of vessels){
   if(!vessel.some(p=>PARTS[p.type].control)){next.push(vessel);continue;}
   const roots=vessel.filter(p=>p.parent&&PARTS[p.type].decoupler&&p.stage===slot.stage);
   const branches=roots.map(root=>{
    const ids=new Set([root.id]);let changed=true;
    while(changed){changed=false;for(const p of vessel)if(ids.has(p.parent)&&!ids.has(p.id)){ids.add(p.id);changed=true;}}
    return {root,ids};
   });
   const removed=new Set(branches.flatMap(b=>[...b.ids]));
   const remaining=vessel.filter(p=>!removed.has(p.id));if(remaining.length)next.push(remaining);
   for(const branch of branches){
    const ids=new Set(branch.ids);
    for(const other of branches)if(other!==branch&&branch.ids.has(other.root.id))for(const id of other.ids)ids.delete(id);
    next.push(vessel.filter(p=>ids.has(p.id)).map(p=>({...p,parent:p.id===branch.root.id?null:p.parent})));
   }
  }
  vessels=next;
  const retained=vessels.find(v=>v.some(p=>p.id===reference?.id));
  for(const vessel of vessels)if(vessel!==retained)for(const p of vessel)if(!separatedAt.has(p.id))separatedAt.set(p.id,slot.stage);
 }
 return {referenceId:reference?.id??null,actions};
}

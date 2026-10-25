import {PARTS} from './catalog.js';
import {stagePlan} from './staging.js';

export function renderStagingPanel(host,parts,{flight=null,onSelect,onMove}){
 host.replaceChildren();
 const note=document.createElement('p');note.className='muted';
 note.textContent=flight?'現在の機体の作動段。飛行中は編集できません。':'上から順にSpaceで作動。同じ段は同時に作動。段の移動は隣の段と交換します。';host.append(note);
 const plan=stagePlan(parts);
 if(!plan.length){note.textContent='点火・分離・パラシュートの対象がありません';return;}
 for(const slot of plan){
  const row=document.createElement('section');row.className='stagingRow';row.setAttribute('aria-label','作動段 '+slot.stage);
  const heading=document.createElement('b');heading.textContent=String(slot.stage).padStart(2,'0')+' · '+(slot.stage+1)+'回目';
  if(flight)heading.textContent+=slot.stage<=flight.stage?' · 通過済み':slot.stage===flight.stage+1?' · 次に作動':'';
  row.append(heading);
  if(!slot.actions.length){const empty=document.createElement('small');empty.textContent=flight&&slot.stage<=flight.stage?'現在の機体に対象なし':'対象なし（Spaceで進む）';row.append(empty);}
  for(const action of slot.actions){
   const p=parts.find(p=>p.id===action.id),button=document.createElement('button');button.textContent=action.label+' · '+(parts.indexOf(p)+1)+'. '+PARTS[p.type].name;
   button.disabled=!!flight;button.onclick=()=>onSelect(p.id);row.append(button);
  }
  if(!flight&&slot.actions.length){
   const controls=document.createElement('div');controls.className='stageMoves';
   for(const [direction,label] of [[-1,'↑ 前へ'],[1,'↓ 後へ']]){const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-label','段 '+slot.stage+' を'+(direction<0?'前':'後')+'へ');b.disabled=slot.stage+direction<0||slot.stage+direction>9;b.onclick=()=>onMove(slot.stage,direction);controls.append(b);}
   row.append(controls);
  }
  host.append(row);
 }
}

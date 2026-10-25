import {PARTS} from './catalog.js';
import {stagePlan} from './staging.js';
import {stagingDiagnostics} from './staging-diagnostics.js';
const references=new WeakMap();

export function renderStagingPanel(host,parts,{flight=null,onSelect,onMove}){
 host.replaceChildren();
 const note=document.createElement('p');note.className='muted';
 note.textContent=flight?'現在の機体の作動段。飛行中は編集できません。':'上から順にSpaceで作動。同じ段は同時に作動。段の移動は隣の段と交換します。';host.append(note);
 const plan=stagePlan(parts);
 if(!plan.length){note.textContent='点火・分離・パラシュートの対象がありません';return;}
 let diagnostic=null;
 if(!flight){
  diagnostic=stagingDiagnostics(parts,references.get(host));references.set(host,diagnostic.referenceId);
  const controlParts=parts.filter(p=>PARTS[p.type].control),label=document.createElement('label');label.className='stageReference';label.textContent='基準の制御部品';
  const select=document.createElement('select');select.setAttribute('aria-label','段診断の基準制御部品');
  for(const p of controlParts){const option=document.createElement('option');option.value=p.id;option.textContent=(parts.indexOf(p)+1)+'. '+PARTS[p.type].name;select.append(option);}
  if(!controlParts.length){const option=document.createElement('option');option.textContent='制御部品なし';select.append(option);select.disabled=true;}
  else select.value=diagnostic.referenceId;
  select.onchange=()=>{references.set(host,select.value);renderStagingPanel(host,parts,{flight,onSelect,onMove});};label.append(select);host.append(label);
  const summary=document.createElement('p');summary.className='muted';const different=diagnostic.actions.filter(a=>a.status!=='reference').length;
  summary.textContent=different?'分離後の作動を確認：'+different+' 対象。各段の注記から部品を見直せます。':'作動予定の '+diagnostic.actions.length+' 対象は、予定段まで基準機と一緒に残ります。';host.append(summary);
  const scope=document.createElement('small');scope.className='stageScope';scope.textContent='各制御機で段を順番に進める想定。燃料・電力・損傷や飛行中の再結合は判定しません。';host.append(scope);
 }
 for(const slot of plan){
  const row=document.createElement('section');row.className='stagingRow';row.setAttribute('aria-label','作動段 '+slot.stage);
  const heading=document.createElement('b');heading.textContent=String(slot.stage).padStart(2,'0')+' · '+(slot.stage+1)+'回目';
  if(flight)heading.textContent+=slot.stage<=flight.stage?' · 通過済み':slot.stage===flight.stage+1?' · 次に作動':'';
  row.append(heading);
  if(!slot.actions.length){const empty=document.createElement('small');empty.textContent=flight&&slot.stage<=flight.stage?'現在の機体に対象なし':'対象なし（Spaceで進む）';row.append(empty);}
  for(const action of slot.actions){
   const p=parts.find(p=>p.id===action.id),button=document.createElement('button');button.textContent=action.label+' · '+(parts.indexOf(p)+1)+'. '+PARTS[p.type].name;
   button.disabled=!!flight;button.onclick=()=>onSelect(p.id);row.append(button);
   const forecast=diagnostic?.actions.find(a=>a.id===action.id&&a.kind===action.kind);
   if(forecast&&forecast.status!=='reference'){
    const warning=document.createElement('small');warning.className='stageDiagnostic '+forecast.status;
    const split=forecast.separatedAt===null?'制御部品がありません。':'段 '+forecast.separatedAt+' で基準機と分離 → 段 '+action.stage+' に作動予定。';
    warning.textContent=split+(forecast.status==='switch'?' 分離側の機体へ操縦切替が必要。':' 分離側に制御部品がなく、作動入力できません。');
    if(forecast.separatedAt===null&&forecast.status==='uncontrolled')warning.textContent='制御部品がなく、作動入力できません。';
    row.append(warning);
   }
  }
  if(!flight&&slot.actions.length){
   const controls=document.createElement('div');controls.className='stageMoves';
   for(const [direction,label] of [[-1,'↑ 前へ'],[1,'↓ 後へ']]){const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-label','段 '+slot.stage+' を'+(direction<0?'前':'後')+'へ');b.disabled=slot.stage+direction<0||slot.stage+direction>9;b.onclick=()=>onMove(slot.stage,direction);controls.append(b);}
   row.append(controls);
  }
  host.append(row);
 }
}

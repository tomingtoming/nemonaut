import {PARTS} from './catalog.js';
import {stageThrustDiagnostics,equipmentDiagnostics} from './design-diagnostics.js';

export function mountDesignDiagnostics(host,getState,onSelect,onVisual=()=>{}){
 const panel=document.createElement('details');panel.id='designDiagnostics';
 panel.innerHTML='<summary>出発前診断 · 推力配置と装備</summary><label>基準制御部品<select aria-label="推力診断の基準制御部品"></select></label><label>推力の計算条件<select aria-label="推力診断の大気"><option value="1.225">海面密度</option><option value="0">真空</option></select></label><p class="muted">各段の開始時 → 接続燃料10%時。全開・ジンバル中立で計算します。空力・姿勢制御の補償や飛行の成功は保証しません。スクリューは対象外です。</p><div class="designThrustRows"></div><p class="muted">装備は組立全体の搭載状況です。分離後の残存は段診断で確認してください。翼は大気と速度、RCSは推進剤、ホイールは電力が必要です。</p><div class="designEquipmentRows"></div>';
 panel.querySelector('.designThrustRows').insertAdjacentHTML('beforebegin','<label class="thrustVisualToggle"><input type="checkbox" class="thrustVisual"> 推力線と診断重心を3D表示</label><label>表示する段<select aria-label="推力線の段" class="thrustStage"></select></label><label>燃料状態<select aria-label="推力線の燃料状態" class="thrustFuel"><option value="full">段の開始時</option><option value="low">接続燃料10%</option></select></label><p class="thrustLegend muted"></p>');host.after(panel);const selects=panel.querySelectorAll('select'),reference=selects[0],density=selects[1];let key='';
 const stageSelect=panel.querySelector('.thrustStage'),fuelSelect=panel.querySelector('.thrustFuel'),visual=panel.querySelector('.thrustVisual');visual.onchange=()=>{key='';update();};
 for(const el of selects)el.onchange=()=>{key='';update();};
 function chooseButton(id,parts){const p=parts.find(p=>p.id===id),b=document.createElement('button');b.textContent=(parts.indexOf(p)+1)+'. '+PARTS[p.type].name;b.onclick=()=>onSelect(id);return b;}
 function update(){const {parts,flight}=getState();panel.hidden=!!flight;if(flight){onVisual(null);key='';return;}
  const next=JSON.stringify([parts,reference.value,density.value,stageSelect.value,fuelSelect.value,visual.checked]);if(next===key)return;
  const selected=reference.value;reference.replaceChildren();
  for(const p of parts.filter(p=>PARTS[p.type].control)){const o=document.createElement('option');o.value=p.id;o.textContent=(parts.indexOf(p)+1)+'. '+PARTS[p.type].name;reference.append(o);}
  if(parts.some(p=>p.id===selected&&PARTS[p.type].control))reference.value=selected;
  reference.disabled=!reference.options.length;
  const result=stageThrustDiagnostics(parts,reference.value,{density:Number(density.value)}),rows=panel.querySelector('.designThrustRows');rows.replaceChildren();
  const previousStage=stageSelect.value;stageSelect.replaceChildren();for(const s of result.stages){const o=document.createElement('option');o.value=s.stage;o.textContent='段 '+s.stage;stageSelect.append(o);}if(result.stages.some(s=>String(s.stage)===previousStage))stageSelect.value=previousStage;stageSelect.disabled=!result.stages.length;
  const balance=result.stages.find(s=>String(s.stage)===stageSelect.value)?.[fuelSelect.value];onVisual(visual.checked?balance:null);panel.querySelector('.thrustLegend').textContent=balance?'桃色：選択した段・燃料状態の重心。橙色：等価推力線（矢印は推力方向、長さは推力に比例しません）。'+(balance.offset===null?'合成推力がゼロのため線を表示できません。残るトルクは上の数値を確認してください。':'推力方向に残るトルク '+(balance.axialTorque/1000).toFixed(3)+' kNm はこの線では表せません。')+' 黄色の全機体重心・水色の空力中心とは計算条件が異なります。':'表示できる推力がありません。';
  const vector=a=>a.map(n=>(Math.abs(n)<.0005?0:n/1000).toFixed(2)).join(', '),distance=n=>n===null?'定義なし':n.toFixed(3)+' m';
  if(!result.stages.length){const p=document.createElement('p');p.textContent=!result.referenceId?'制御部品を追加すると段ごとの推力配置を確認できます。':parts.some(p=>PARTS[p.type].thrust&&!PARTS[p.type].water)?'この条件で有効なエンジン推力がありません。点火段・燃料・大気条件を確認してください。ジェットは真空で推力を出せません。':'ロケット・ジェットエンジンは搭載されていません。車輪・スクリューはこの推力配置診断の対象外です。';rows.append(p);}
  for(const s of result.stages){const row=document.createElement('section');row.className='stagingRow';const title=document.createElement('b');title.textContent='段 '+s.stage+' · 合成推力 '+(s.full.thrust/1000).toFixed(1)+' kN';const data=document.createElement('p');data.textContent='重心からの等価偏心距離 '+distance(s.full.offset)+' → '+distance(s.low.offset)+'。トルク XYZ（kNm） '+vector(s.full.torque)+' → '+vector(s.low.torque)+'。';row.append(title,data);
   if(s.full.offset===null){const note=document.createElement('small');note.textContent='合成推力が相殺され、推力線を定義できません。トルクが残る場合は回転だけが生じます。';row.append(note);}
   for(const id of s.full.engineIds)row.append(chooseButton(id,parts));rows.append(row);
  }
  const equipment=equipmentDiagnostics(parts),equip=panel.querySelector('.designEquipmentRows');equip.replaceChildren();
  const capacity=document.createElement('p');capacity.textContent='満充電時の蓄電容量 '+equipment.capacity+' EC。発電は日照とパネル方向に依存します。';equip.append(capacity);
  for(const [name,label]of [['controls','制御装置'],['wheels','有効なリアクションホイール'],['rcs','RCS'],['gimbals','ジンバル'],['surfaces','操舵翼'],['solar','ソーラーパネル'],['shields','熱シールド'],['chutes','パラシュート']]){const row=document.createElement('div'),title=document.createElement('p');title.textContent=label+'：'+equipment[name].length+' 個';row.append(title);for(const id of equipment[name])row.append(chooseButton(id,parts));equip.append(row);}
  key=JSON.stringify([parts,reference.value,density.value,stageSelect.value,fuelSelect.value,visual.checked]);
 }
 return {update};
}

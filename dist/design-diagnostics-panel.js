import {PARTS} from './catalog.js';
import {stageThrustDiagnostics,equipmentDiagnostics} from './design-diagnostics.js';

export function mountDesignDiagnostics(host,getState,onSelect){
 const panel=document.createElement('details');panel.id='designDiagnostics';
 panel.innerHTML='<summary>出発前診断 · 推力配置と装備</summary><label>基準制御部品<select aria-label="推力診断の基準制御部品"></select></label><label>推力の計算条件<select aria-label="推力診断の大気"><option value="1.225">海面密度</option><option value="0">真空</option></select></label><p class="muted">各段の開始時 → 接続燃料10%時。全開・ジンバル中立で計算します。空力・姿勢制御の補償や飛行の成功は保証しません。スクリューは対象外です。</p><div class="designThrustRows"></div><p class="muted">装備は組立全体の搭載状況です。分離後の残存は段診断で確認してください。翼は大気と速度、RCSは推進剤、ホイールは電力が必要です。</p><div class="designEquipmentRows"></div>';
 host.after(panel);const selects=panel.querySelectorAll('select'),reference=selects[0],density=selects[1];let key='';
 for(const el of selects)el.onchange=()=>{key='';update();};
 function chooseButton(id,parts){const p=parts.find(p=>p.id===id),b=document.createElement('button');b.textContent=(parts.indexOf(p)+1)+'. '+PARTS[p.type].name;b.onclick=()=>onSelect(id);return b;}
 function update(){const {parts,flight}=getState();panel.hidden=!!flight;if(flight)return;
  const next=JSON.stringify([parts,reference.value,density.value]);if(next===key)return;
  const selected=reference.value;reference.replaceChildren();
  for(const p of parts.filter(p=>PARTS[p.type].control)){const o=document.createElement('option');o.value=p.id;o.textContent=(parts.indexOf(p)+1)+'. '+PARTS[p.type].name;reference.append(o);}
  if(parts.some(p=>p.id===selected&&PARTS[p.type].control))reference.value=selected;
  reference.disabled=!reference.options.length;
  const result=stageThrustDiagnostics(parts,reference.value,{density:Number(density.value)}),rows=panel.querySelector('.designThrustRows');rows.replaceChildren();
  const vector=a=>a.map(n=>(Math.abs(n)<.0005?0:n/1000).toFixed(2)).join(', '),distance=n=>n===null?'定義なし':n.toFixed(3)+' m';
  if(!result.stages.length){const p=document.createElement('p');p.textContent=!result.referenceId?'制御部品を追加すると段ごとの推力配置を確認できます。':parts.some(p=>PARTS[p.type].thrust&&!PARTS[p.type].water)?'この条件で有効なエンジン推力がありません。点火段・燃料・大気条件を確認してください。ジェットは真空で推力を出せません。':'ロケット・ジェットエンジンは搭載されていません。車輪・スクリューはこの推力配置診断の対象外です。';rows.append(p);}
  for(const s of result.stages){const row=document.createElement('section');row.className='stagingRow';const title=document.createElement('b');title.textContent='段 '+s.stage+' · 合成推力 '+(s.full.thrust/1000).toFixed(1)+' kN';const data=document.createElement('p');data.textContent='重心からの等価偏心距離 '+distance(s.full.offset)+' → '+distance(s.low.offset)+'。トルク XYZ（kNm） '+vector(s.full.torque)+' → '+vector(s.low.torque)+'。';row.append(title,data);
   if(s.full.offset===null){const note=document.createElement('small');note.textContent='合成推力が相殺され、推力線を定義できません。トルクが残る場合は回転だけが生じます。';row.append(note);}
   for(const id of s.full.engineIds)row.append(chooseButton(id,parts));rows.append(row);
  }
  const equipment=equipmentDiagnostics(parts),equip=panel.querySelector('.designEquipmentRows');equip.replaceChildren();
  const capacity=document.createElement('p');capacity.textContent='満充電時の蓄電容量 '+equipment.capacity+' EC。発電は日照とパネル方向に依存します。';equip.append(capacity);
  for(const [name,label]of [['controls','制御装置'],['wheels','有効なリアクションホイール'],['rcs','RCS'],['gimbals','ジンバル'],['surfaces','操舵翼'],['solar','ソーラーパネル'],['shields','熱シールド'],['chutes','パラシュート']]){const row=document.createElement('div'),title=document.createElement('p');title.textContent=label+'：'+equipment[name].length+' 個';row.append(title);for(const id of equipment[name])row.append(chooseButton(id,parts));equip.append(row);}
  key=JSON.stringify([parts,reference.value,density.value]);
 }
 return {update};
}

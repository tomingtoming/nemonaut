import {canControl} from './fleet.js';

export function remainingBurnSeconds(f){
 const n=f?.maneuver;if(!n||n.complete||f.throttle<=0||f.lastThrust<=0)return null;
 const left=Math.hypot(...n.remaining),force=f.lastThrust,acceleration=force/f.stats.mass;
 return Number.isFinite(acceleration)&&acceleration>0?left/acceleration:null;
}

// Explicit opt-in per plan. Never lights an engine or chooses its throttle.
export function mountManeuverStop(panel,getFlight,kind){
 const label=document.createElement('label'),input=document.createElement('input'),estimate=document.createElement('small');
 input.type='checkbox';input.setAttribute('aria-label','目標Δvで噴射停止');
 label.append(input,document.createTextNode('目標Δvで噴射停止（点火・推力調整は手動）'));
 panel.append(label,estimate);
 input.onchange=()=>{const f=getFlight();if(f?.maneuver?.[kind]&&!f.maneuver.complete&&canControl(f))f.maneuver.stopAtTarget=input.checked;update();};
 function update(){
  const f=getFlight(),node=f?.maneuver?.[kind]?f.maneuver:null;
  input.checked=node?.stopAtTarget===true;input.disabled=!node||node.complete||!canControl(f);
  const seconds=node?remainingBurnSeconds(f):null;
  estimate.textContent=!node?'計画固定後に停止支援を選べます。':node.complete?(node.stopAtTarget?'目標到達 · 停止支援を選択済み':'目標到達 · 手動で噴射を停止してください。'):seconds!==null?`現在の推力なら残り約 ${seconds.toFixed(1)} 秒（整列時の目安）。`:'点火・開始時刻・方向を確認してください。停止支援は点火しません。';
 }
 return {update};
}

// @ts-nocheck: typing debt (BACKLOG 4d). Remove this line once tsc passes the file.
import {mountManeuverStop} from './maneuver-stop.js';
import {maneuverBurnAvailable,recoveryGuidance} from './maneuver-controls.js';
import * as T from 'three';
import {lunarReturnPlan,lunarReturnNode} from './lunar-return.js';
import {canControl} from './fleet.js';
import {formatDuration} from './orbit-plan.js';

export function mountReturnPanel(host,getFlight,changed,{isPractice=()=>false}={}){
 const panel=document.createElement('details');panel.id='returnPanel';panel.hidden=true;
 panel.innerHTML='<summary>月から母星へ帰還計画</summary><p class="returnStatus" role="status"></p><p class="returnNumbers"></p><label>瞬間噴射で狙う母星近点<select class="returnTarget" aria-label="帰還目標近点"><option value="" disabled>旧計画 · 目標高度の保存なし</option><option value="35000" selected>35 km · 大気接近</option><option value="15000">15 km · 帰還カプセル向け</option></select></label><small>有限噴射後の予測近点はこの値からずれます。固定後の予測を確認してください。15 kmはLuna Returnで検証した条件です。</small><button class="returnPlan">帰還計画を固定・SAS整列</button><div><button class="returnFull">帰還噴射100%</button><button class="returnFine">帰還微調整10%</button><button class="returnPrecise">帰還微調整1%</button><button class="returnStop">帰還噴射を停止</button></div><details class="flightHelp"><summary>帰還の手順と予測の範囲</summary><small>点火済み段・スロットル0で計画を固定。開始60秒前に高速航行を解除し、SAS予定噴射で方向差を小さくします。開始時刻に100%、残り10 m/sで10%、残り2 m/sで1%へ。目標到達の表示で即座に停止してください。点火・推力調整は手動です。停止支援は下のチェックで選択できます。</small><small>月脱出時の母星軌道から大気接近を計画します。有限噴射の予測も理想整列と指定操作が前提です。手動操作の遅れで近点は変わるため、月脱出後の実際の母星近点を確認してください。SOI境界では通常速度で境界を通過してから再加速。大気手前で高速航行を解除します。Luna Returnは15 kmを選んで計画し、母星接近後にSpaceで推進部を分離、SAS逆行、再度SpaceまたはHでパラシュートを待機。既存のSeleneには耐熱帰還装備がなく、この計画だけで安全着地はできません。</small></details>';
 host.before(panel);const stopAssist=mountManeuverStop(panel,getFlight,'returnPlan');let message='',vessel=null;
 panel.querySelector('.returnPlan').onclick=()=>{const f=getFlight();if(!f||!canControl(f))return;try{const p=lunarReturnPlan(f,{targetPeriapsis:Number(panel.querySelector('.returnTarget').value)});f.maneuver=lunarReturnNode(p,f);f.sas=true;f.sasMode='maneuver';message='';changed('母星帰還計画を固定しました。点火・停止は手動です。');}catch(e){message=e.message;}update();};
 for(const [name,throttle]of [['Full',1],['Fine',.1],['Precise',.01],['Stop',0]])panel.querySelector('.return'+name).onclick=()=>{const f=getFlight();if(f?.maneuver?.returnPlan&&canControl(f)&&(throttle===0||maneuverBurnAvailable(f,'returnPlan'))){f.throttle=throttle;changed();update();}};
 function update(){stopAssist.update();const f=getFlight(),node=f?.maneuver,meta=node?.returnPlan;panel.hidden=!f||(f.orbit?.bodyId!=='moon'&&!meta);if(panel.hidden)return;
  if(vessel!==f){vessel=f;message='';panel.open=!!meta;panel.querySelector('.returnTarget').value=meta?String(meta.targetPeriapsis??''):'35000';}
  panel.querySelector('.returnPlan').disabled=!canControl(f)||!!meta;panel.querySelector('.returnTarget').disabled=!!meta;
  for(const name of ['Full','Fine','Precise','Stop'])panel.querySelector('.return'+name).disabled=name==='Stop'?(!canControl(f)||!meta):!maneuverBurnAvailable(f,'returnPlan');
  const status=panel.querySelector('.returnStatus'),numbers=panel.querySelector('.returnNumbers');
  if(!meta){status.textContent=message||'月周回・点火済み段・噴射停止から計画します。';numbers.textContent='';return;}
  const left=new T.Vector3(...node.remaining).length(),until=node.universalTime-f.universalTime,angle=new T.Vector3(0,1,0).applyQuaternion(f.q).angleTo(new T.Vector3(...(node.complete?node.impulse:node.remaining)))*180/Math.PI,o=f.orbit;
  status.textContent=f.crashed||f.landed?recoveryGuidance(f,{practice:isPractice()}):node.complete&&f.throttle>0?'目標Δv到達：今すぐ噴射停止':node.complete&&o.bodyId==='planet'&&o.altitude<70000?recoveryGuidance(f,{practice:isPractice()}):node.complete?(f.throttle>0?'目標Δv到達：今すぐ噴射停止':o.bodyId==='moon'?'噴射終了。月を脱出した後の母星軌道を確認':'月脱出済み。母星への接近を確認してください'):until>0?'帰還噴射開始まで '+formatDuration(until):f.throttle>0?(left<2?'1%で微調整、到達表示で即停止':left<10?'10%へ絞って残りΔvを確認':'帰還噴射中：残り10 m/sで10%へ'):'噴射開始時刻です（'+formatDuration(-until)+'経過）';
  numbers.textContent=`${node.complete?'目標との差':'残り'} ${left.toFixed(2)} / ${meta.deltaV.toFixed(1)} m/s · 方向差 ${angle.toFixed(1)}° · 現在 ${(100*f.throttle).toFixed(1)}%。全開換算 ${meta.duration.toFixed(1)}秒。有限噴射予測の母星近点 ${(meta.predictedPeriapsis/1000).toFixed(1)} km。`+(o.bodyId==='planet'?` 現在の母星近点 ${(o.periapsis/1000).toFixed(1)} km · 高度 ${(o.altitude/1000).toFixed(1)} km · 鉛直 ${o.vertical.toFixed(1)} m/s。`:'');
 }
 return {update};
}

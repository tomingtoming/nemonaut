import {descentTelemetry} from './descent.js';

export function mountDescentPanel(host,getFlight,changed){
 const panel=document.createElement('section');panel.id='descentPanel';panel.hidden=true;
 panel.innerHTML='<strong>月面降下・接地計器</strong><p class="descentStatus" role="status"></p><p class="descentNumbers"></p><div><button class="descentRetro">SAS逆行で減速</button><button class="descentUp">SAS天頂で脚を下へ</button></div><div><button class="descentFull">全開</button><button class="descentHover">静止推力の目安へ</button><button class="descentLess">−0.5%</button><button class="descentMore">＋0.5%</button><button class="descentStop">噴射停止</button></div><small>月周回から逆行に整列し、点火して水平速度を減らします。低速になったら天頂へ。脚の対地距離と鉛直速度を見てスロットルを調整し、最後は1 m/s未満で接地、噴射停止。減速距離は推力を速度の反対へ向けた一定重力の目安です。静止推力は天頂を向いた場合の値で、自動高度保持ではありません。</small>';
 host.after(panel);
 for(const [name,mode]of [['Retro','retrograde'],['Up','radial']])panel.querySelector('.descent'+name).onclick=()=>{const f=getFlight();if(f&&!f.crashed){f.sas=true;f.sasMode=mode;changed();}};
 for(const name of ['Full','Hover','Less','More','Stop'])panel.querySelector('.descent'+name).onclick=()=>{const f=getFlight();if(!f||f.crashed)return;const d=descentTelemetry(f);f.throttle=name==='Stop'?0:name==='Full'?1:name==='Hover'?Math.min(1,d.hoverThrottle):Math.max(0,Math.min(1,f.throttle+(name==='More'?.005:-.005)));changed();};
 function update(){
  const f=getFlight();panel.hidden=!f||f.orbit?.bodyId!=='moon'||(f.orbit.energy>=0&&f.orbit.altitude>30000);if(panel.hidden)return;
  const d=descentTelemetry(f);for(const button of panel.querySelectorAll('button'))button.disabled=f.crashed;
  panel.querySelector('.descentHover').disabled=f.crashed||!Number.isFinite(d.hoverThrottle)||d.hoverThrottle>1;
  panel.querySelector('.descentStatus').textContent=d.crashed?'機体損傷':d.landed?(f.throttle>0?'月面で静止：噴射を停止してください':'月面着陸完了：噴射停止・静止を確認'):!d.thrust?'点火段を確認してください。Spaceで点火、スロットルは手動です。':d.netAcceleration<=0?'推力不足：月面へ向かう速度を止められません':d.clearance<d.brakingDistance?'減速距離が対地距離を超えています：直ちに減速し、姿勢も確認':d.horizontal>5?'まず水平速度を減らしてください':'天頂へ整列し、接地前に鉛直速度を1 m/s未満へ';
  const distance=n=>Number.isFinite(n)?n.toFixed(0)+' m':'算出不可';
  panel.querySelector('.descentNumbers').textContent=`最低部の対地距離 ${distance(d.clearance)} · 水平 ${d.horizontal.toFixed(1)} m/s · 鉛直 ${d.vertical.toFixed(1)} m/s。減速距離 ${distance(d.brakingDistance)}（鉛直のみ ${distance(d.verticalBrakingDistance)}）。天頂静止推力 ${Number.isFinite(d.hoverThrottle)?(100*d.hoverThrottle).toFixed(1)+'%':'—'} · 現在 ${(100*f.throttle).toFixed(1)}% · 推力軸の傾き ${d.tilt===null?'—':d.tilt.toFixed(1)+'°'} · 着陸脚 ${d.legs}本。`;
 }
 return {update};
}

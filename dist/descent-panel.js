import {descentTelemetry,descentGuidance} from './descent.js';

export function mountDescentPanel(host,getFlight,changed){
 const panel=document.createElement('section');panel.id='descentPanel';panel.hidden=true;
 panel.innerHTML='<strong>月面降下・接地計器</strong><p class="descentStatus" role="status"></p><p class="descentNumbers"></p><div><button class="descentRetro">SAS逆行で減速</button><button class="descentUp">SAS天頂で脚を下へ</button></div><div><button class="descentFull">全開</button><button class="descentHover">静止推力の目安へ</button><button class="descentLess">−0.5%</button><button class="descentMore">＋0.5%</button><button class="descentStop">噴射停止</button></div><small>月周回から逆行に整列し、点火して水平速度を減らします。低速になったら天頂へ。脚の対地距離と鉛直速度を見てスロットルを調整し、最後は1 m/s未満で接地、噴射停止。減速距離は推力を速度の反対へ向けた一定重力の目安です。静止推力は天頂を向いた場合の値で、自動高度保持ではありません。</small>';
 const expeditionHelp=document.createElement('details');expeditionHelp.className='flightHelp';
 expeditionHelp.innerHTML='<summary>高い月周回から着陸・帰還する手順</summary><small>Selene Expedition向け：①F5で保存。逆行へ整列して噴射し、近点を約1 kmまで下げて停止。②惰性で降下。高速航行が止まったら通常速度で逆行・減速し、水平速度と鉛直速度を確認。停止高度は安全着陸を保証しません。③低速で天頂へ整列し、静止推力を目安に下降速度を調整。高高度で長く低速降下すると燃料を使い切ります。地面へ近づくほど減速し、最後は1 m/s未満で接地・噴射停止。④「月面から再離陸」の手順で周回し、帰還計画を作成。母星の大気へ入る前に次の段で脚・タンク・エンジンを分離、さらに次の段で傘を待機。熱シールドを進行方向へ向けます。</small><small>上級向けの見本です。自動試験では月面離陸後の燃料は約6%でした。操作の遅れ・長い滞空・再計画で不足し得ます。出発時刻で軌道も変わるため、高度・時刻を固定せず計器と計画を確認してください。</small>';
 panel.append(expeditionHelp);
 host.after(panel);
 for(const [name,mode]of [['Retro','retrograde'],['Up','radial']])panel.querySelector('.descent'+name).onclick=()=>{const f=getFlight();if(f&&!f.crashed){f.sas=true;f.sasMode=mode;changed();}};
 for(const name of ['Full','Hover','Less','More','Stop'])panel.querySelector('.descent'+name).onclick=()=>{const f=getFlight();if(!f||f.crashed)return;const d=descentTelemetry(f);f.throttle=name==='Stop'?0:name==='Full'?1:name==='Hover'?Math.min(1,d.hoverThrottle):Math.max(0,Math.min(1,f.throttle+(name==='More'?.005:-.005)));changed();};
 function update(){
  const f=getFlight();panel.hidden=!f||f.orbit?.bodyId!=='moon'||(f.orbit.energy>=0&&f.orbit.altitude>30000);if(panel.hidden)return;
  const d=descentTelemetry(f);for(const button of panel.querySelectorAll('button'))button.disabled=f.crashed;
  panel.querySelector('.descentHover').disabled=f.crashed||!Number.isFinite(d.hoverThrottle)||d.hoverThrottle>1;
  panel.querySelector('.descentStatus').textContent=descentGuidance(d,f.throttle);
  const distance=n=>Number.isFinite(n)?n.toFixed(0)+' m':'算出不可';
  panel.querySelector('.descentNumbers').textContent=`最低部の対地距離 ${distance(d.clearance)} · 水平 ${d.horizontal.toFixed(1)} m/s · 鉛直 ${d.vertical.toFixed(1)} m/s。減速距離 ${distance(d.brakingDistance)}（鉛直のみ ${distance(d.verticalBrakingDistance)}）。天頂静止推力 ${Number.isFinite(d.hoverThrottle)?(100*d.hoverThrottle).toFixed(1)+'%':'—'} · 現在 ${(100*f.throttle).toFixed(1)}% · 推力軸の傾き ${d.tilt===null?'—':d.tilt.toFixed(1)+'°'} · 着陸脚 ${d.legs}本。`;
 }
 return {update};
}

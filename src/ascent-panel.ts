import {setAscentAttitude,lunarOrbitReached} from './lunar-ascent.js';
import {descentTelemetry} from './descent.js';
import {canControl} from './fleet.js';

export function mountAscentPanel(host,getFlight,changed){
 const panel=document.createElement('details');panel.id='ascentPanel';panel.hidden=true;
 panel.innerHTML='<summary>月面から再離陸・周回へ</summary><p class="ascentStatus" role="status"></p><p class="ascentNumbers"></p><div><button data-pitch="90">直立へ整列</button><button data-pitch="45">45°へ整列</button><button data-pitch="0">水平へ整列</button><button class="ascentPrograde">SAS順行へ</button></div><div><button class="ascentBurn">30%で噴射</button><button class="ascentStop">離陸噴射を停止</button></div><details class="flightHelp"><summary>Seleneの離陸手順</summary><small>①直立でSpace点火、30%で離陸。②高度300 mで45°、3 kmで水平へ整列。③遠点20 kmで噴射停止。④無推力で上昇し、鉛直速度が約3 m/sになったらSAS順行・30%噴射。⑤近点5 kmを越えたら停止し、遠点も月重力圏内か確認。満タンと着陸後43%燃料で検証した目安です。改造時は推力と燃料を再確認してください。</small><small>整列ボタンはその瞬間の局所角度をSAS姿勢保持へ指定します。水平の方位は水平速度方向、低速時は基準方向です。時間と移動に伴い地平線との角度は変わります。実際に旋回するにはホイール・電力などの装備が必要です。点火・停止は手動です。</small></details>';
 host.before(panel);let vessel=null;
 for(const button of panel.querySelectorAll<HTMLElement>('[data-pitch]'))button.onclick=()=>{const f=getFlight();if(!f||!canControl(f))return;setAscentAttitude(f,Number(button.dataset.pitch));changed();};
 panel.querySelector<HTMLElement>('.ascentPrograde').onclick=()=>{const f=getFlight();if(f&&canControl(f)){f.sas=true;f.sasMode='prograde';changed();}};
 for(const [selector,throttle]of [['.ascentBurn',.3],['.ascentStop',0]] as [string,number][])panel.querySelector<HTMLElement>(selector).onclick=()=>{const f=getFlight();if(f&&canControl(f)){f.throttle=throttle;changed();}};
 function update(){const f=getFlight();panel.hidden=!f||f.orbit?.bodyId!=='moon'||!f.rocketAxes;if(panel.hidden)return;
  if(vessel!==f){vessel=f;panel.open=f.environment==='moon-surface';}
  for(const button of panel.querySelectorAll('button'))button.disabled=!canControl(f);
  const o=f.orbit,d=descentTelemetry(f),success=lunarOrbitReached(o)&&o.periapsis>5000;
  panel.querySelector('.ascentStatus').textContent=f.crashed?'機体損傷':success?(f.throttle>0?'周回条件を満たしました：噴射を停止':'月周回成立：近点5 km超・遠点は重力圏内'):!f.started?'直立へ整列し、Spaceで点火段を作動':d.thrust===0?'推進剤・点火済みエンジンを確認':f.landed?'30%で離陸し、300 mで45°へ':o.apoapsis>=20000?(f.throttle>0&&o.vertical>5?'遠点20 km以上：噴射を止め、遠点へ上昇':'鉛直速度が約3 m/sになったら順行・30%。近点5 kmで停止'):o.altitude<300?'直立で上昇：高度300 mで45°へ':o.altitude<3000?'45°で加速：高度3 kmで水平へ':'水平加速：遠点20 kmで噴射停止';
  const km=n=>Number.isFinite(n)?(n/1000).toFixed(1)+' km':'脱出';
  panel.querySelector('.ascentNumbers').textContent=`高度 ${km(o.altitude)} · 鉛直 ${o.vertical.toFixed(1)} m/s · 水平 ${d.horizontal.toFixed(1)} m/s。遠点 ${km(o.apoapsis)} / 近点 ${km(o.periapsis)}。燃料 ${(100*f.fuelRatio).toFixed(0)}% · 月TWR ${(d.acceleration/d.gravity).toFixed(1)}（全開）。`;
 }
 return {update};
}

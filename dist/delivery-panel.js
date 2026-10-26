import {observationStatus} from './observation.js';
import {surveyProgress} from './surface-survey.js';
import {deliveryStation} from './delivery-station.js';
import {fleet} from './fleet.js';
import {projectDeliverySite} from './site-marker.js';
import {floatingWindow} from './floating-window.js';
import {DELIVERY_SITE,deliveryBearing,SURVEY_TARGET_SECONDS} from './delivery-sites.js';
import {deliveryTelemetry} from './surface-delivery.js';
const key='orbital-foundry-delivery-guide';
export function mountDeliveryPanel(root,getState,notify,onVisit){
 let followed=false,window=null;try{followed=localStorage.getItem(key)==='1';}catch{}
 const centerButton=document.createElement('button');centerButton.id='centerDelivery';centerButton.textContent='探査計画';root.querySelector('#centerTracking').after(centerButton);
 const hud=document.createElement('button');hud.id='deliveryGuide';hud.hidden=true;hud.setAttribute('aria-label','観測点への案内');root.querySelector('#flightHud').append(hud);
 const menuButton=document.createElement('button');menuButton.textContent='探査計画';menuButton.id='flightDelivery';root.querySelector('#flightQuickNav').append(menuButton,hud);
 const marker=document.createElement('button');marker.id='deliverySiteMarker';marker.hidden=true;marker.textContent='◇ 北観測点';marker.setAttribute('aria-label','北観測点の位置');root.querySelector('#flightHud').append(marker);
 const close=()=>{window?.remove();window=null;};
 function open(){
  if(window){window.front();return;}
  window=floatingWindow(root.body,{title:'北観測点',x:innerWidth-340,y:100,onClose:close});window.element.classList.add('deliveryWindow');
  window.content.innerHTML='<p>発射台から北へ600 m · 半径30 m</p><p>探査コアと太陽電池を届け、運搬機から分離して設置。</p><p class="deliveryResult" role="status"></p><button class="deliveryFollow"></button><p class="deliveryStation"></p><button class="deliveryVisit">観測機へ</button><section class="surveyProgress"><b>昼夜の比較観測</b><label>日照 <progress class="surveyDay"></progress><output class="surveyDayValue"></output></label><label>夜間 <progress class="surveyNight"></progress><output class="surveyNightValue"></output></label><p class="surveyResult"></p></section><details><summary>達成条件</summary><p>通常出発した部品で、車輪・主エンジンを残さず、電力のある観測機を無損傷で接地・静止させます。運搬方法は自由。設置した機体は世界に残ります。設置したコアを右クリックして観測をONにし、日照・夜間それぞれ150分のデータを集めます。中断してもデータは残ります。</p></details>';
  window.content.querySelector('.deliveryVisit').onclick=()=>{const state=getState(),record=state.history.find(e=>e.type==='delivery'&&e.siteId===DELIVERY_SITE.id);if(record&&!state.practice){close();onVisit(record.probePartId);}};
  window.content.querySelector('.deliveryFollow').onclick=()=>{followed=!followed;try{localStorage.setItem(key,followed?'1':'0');}catch{notify('案内表示の設定を保存できません');}update();};update();window.clamp();
 }
 centerButton.onclick=open;menuButton.onclick=open;hud.onclick=open;marker.onclick=open;
 function update(){
  const {flight,history,practice,atCenter,world}=getState(),done=history.find(e=>e.type==='delivery'&&e.siteId===DELIVERY_SITE.id);
  centerButton.textContent=done?'探査計画 ✓':'探査計画';
  const d=flight?deliveryTelemetry(flight,history,{practice}):null;
  hud.hidden=!followed||!flight||atCenter;
  if(!hud.hidden){const center=flight.pos.clone().add(flight.stats.com.clone().applyQuaternion(flight.q)),bearing=deliveryBearing(center,flight.universalTime),distance=d.distance<1000?Math.round(d.distance)+' m':(d.distance/1000).toFixed(1)+' km';hud.textContent=DELIVERY_SITE.name+' · '+distance+(bearing===null?'':' · '+(Math.round(bearing)%360)+'°')+' · '+(done?'記録済み':d.reason||'設置条件達成');}
  if(window){window.content.querySelector('.deliveryResult').textContent=done?'✓ 設置記録 · '+done.name:practice?'練習中：達成記録の対象外':d?d.reason||'設置条件達成':'未達成';window.content.querySelector('.deliveryFollow').textContent=followed?'案内を非表示':'目的地を案内';const station=practice?null:deliveryStation(history,flight?fleet(flight):world?.vessels??[]),text=window.content.querySelector('.deliveryStation'),visit=window.content.querySelector('.deliveryVisit');
text.hidden=!station;visit.hidden=!station?.vessel;const survey=surveyProgress(history,practice?[]:flight?fleet(flight):world?.vessels??[]);window.content.querySelector('.surveyProgress').hidden=practice;for(const key of ['day','night']){const suffix=key==='day'?'Day':'Night',bar=window.content.querySelector('.survey'+suffix);bar.max=SURVEY_TARGET_SECONDS;bar.value=survey[key];bar.setAttribute('aria-label',key==='day'?'日照の観測進捗':'夜間の観測進捗');window.content.querySelector('.survey'+suffix+'Value').textContent=Math.min(150,Math.floor(survey[key]/60))+' / 150 分';}window.content.querySelector('.surveyResult').textContent=survey.completed?'✓ 昼夜観測を完了':station?.vessel?observationStatus(station.vessel,station.record.probePartId,{paused:atCenter||!flight}):station?'観測機は現在の世界にありません':'観測機を設置してください';
if(station)text.textContent=station.vessel?(station.vessel.vesselName||'観測機')+' · '+(station.damaged?'損傷':station.landed?'接地':'飛行中')+' · 観測点から '+Math.round(station.distance)+' m · '+station.power.stored.toFixed(0)+' / '+station.power.capacity+' EC':'観測機は現在の世界にありません';}
 }
 function updateMarker(camera,width,height){const {flight,atCenter}=getState();const visible=followed&&flight&&!atCenter&&root.querySelector('#orbitOverlay').hidden;const p=visible?projectDeliverySite(camera,flight.universalTime,width,height):null;marker.hidden=!p;if(p){marker.style.left=p.x+'px';marker.style.top=p.y+'px';}}
 return {update,close,updateMarker};
}

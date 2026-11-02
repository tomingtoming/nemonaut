import {storageKey} from './app-id.js';
import {siteApproachText} from './site-approach.js';
import {precisionLandingStatus} from './precision-landing.js';
import {qualitySummary} from './observation-quality.js';
import {observationStatus} from './observation.js';
import {surveyProgress} from './surface-survey.js';
import {deliveryStation} from './delivery-station.js';
import {fleet,type FleetNode} from './fleet.js';
import {projectDeliverySite} from './site-marker.js';
import {floatingWindow,type FloatingWindow} from './floating-window.js';
import {DELIVERY_SITES,selectedDeliverySite,selectDeliverySite,deliveryBearing,SURVEY_TARGET_SECONDS} from './delivery-sites.js';
import {deliveryTelemetry} from './surface-delivery.js';
const key=storageKey('delivery-guide');
export type DeliveryStationVessel=import('./surface-survey.js').SurveyVessel&import('./observation.js').ObservationStatusVessel;
/** A saved world vessel as the station and survey lookups read it. */
export type DeliveryWorldVessel=import('./surface-survey.js').SurveyStationVessel&{vesselName?:string|null};
export type DeliveryPanelFlightBase=import('./surface-delivery.js').DeliveryVessel&import('./site-approach.js').SiteApproachVessel&import('./precision-landing.js').PrecisionStatusVessel&DeliveryStationVessel;
export interface DeliveryPanelFlight extends DeliveryPanelFlightBase,FleetNode<DeliveryPanelFlight>{}
export interface DeliveryPanelState{flight:DeliveryPanelFlight|null|undefined;history:readonly import('./world-history.js').WorldHistoryEvent[];practice:boolean;atCenter:boolean;world?:{vessels:readonly DeliveryWorldVessel[]}|null}
export interface DeliveryPanel{update():void;close():void;updateMarker(camera:import('three').Camera,width:number,height:number):void}
export function mountDeliveryPanel(root:Document,getState:()=>DeliveryPanelState,notify:(message:string)=>void,onVisit:(probePartId:string|undefined)=>void):DeliveryPanel{
 let challenge='delivery';try{if(localStorage.getItem(storageKey('challenge'))==='precision')challenge='precision';}catch{}
 let followed=false,window:FloatingWindow|null=null,qualityMarkup:string|null=null;try{followed=localStorage.getItem(key)==='1';}catch{}
 const centerButton=document.createElement('button');centerButton.id='centerDelivery';centerButton.textContent='探査計画';root.querySelector('#centerTracking')!.after(centerButton);
 const hud=document.createElement('button');hud.id='deliveryGuide';hud.hidden=true;hud.setAttribute('aria-label','観測点への案内');root.querySelector('#flightHud')!.append(hud);
 const menuButton=document.createElement('button');menuButton.textContent='探査計画';menuButton.id='flightDelivery';root.querySelector('#flightQuickNav')!.append(menuButton,hud);
 const marker=document.createElement('button');marker.id='deliverySiteMarker';marker.hidden=true;marker.textContent='◇ 北観測点';marker.setAttribute('aria-label','北観測点の位置');root.querySelector('#flightHud')!.append(marker);
 const close=()=>{window?.remove();window=null;};
 function open(){
  if(window){window.front();return;}
  window=floatingWindow(root.body,{title:'探査計画',x:innerWidth-340,y:100,onClose:close});window.element.classList.add('deliveryWindow');
  qualityMarkup=null;window.content.innerHTML='<select class="deliverySelect" aria-label="観測地点"></select><select class="challengeSelect" aria-label="課題"><option value="delivery">設置・観測</option><option value="precision">精密着陸</option></select><p class="deliveryLocation"></p><p class="deliveryInstructions">探査コアと太陽電池を届け、運搬機から分離して設置。</p><p class="deliveryResult" role="status"></p><button class="deliveryFollow"></button><p class="deliveryStation"></p><button class="deliveryVisit">観測機へ</button><section class="surveyProgress"><b>昼夜の比較観測</b><label>日照 <progress class="surveyDay"></progress><output class="surveyDayValue"></output></label><label>夜間 <progress class="surveyNight"></progress><output class="surveyNightValue"></output></label><p class="surveyResult"></p></section><section class="precisionChallenge"><p class="precisionResult" role="status"></p><p>通常出発し、対地100 m以上へ上昇。円内に最初の接地をして、無損傷・地表速度0.5 m/s未満で停止。機体の種類は自由。</p></section><details class="surveyQuality"><summary>観測品質</summary><table><thead><tr><th>地点</th><th>取得</th><th>欠測</th><th>取得率</th></tr></thead><tbody></tbody></table><p>観測ON・接地静止中の計測分。旧版の欠測は未計測。機体がない地点は達成時の記録。</p></details><details class="deliveryConditions"><summary>達成条件</summary><p>通常出発した部品で、車輪・主エンジンを残さず、電力のある観測機を無損傷で接地・静止させます。運搬方法は自由。設置した機体は世界に残ります。設置したコアを右クリックして観測をONにし、日照・夜間それぞれ150分のデータを集めます。中断してもデータは残ります。</p></details>';
  const task=window.content.querySelector('.challengeSelect') as HTMLSelectElement;task.value=challenge;task.onchange=()=>{challenge=task.value;try{localStorage.setItem(storageKey('challenge'),challenge);}catch{}update();window!.clamp();};
  for(const details of window.content.querySelectorAll('details'))details.ontoggle=()=>window?.clamp();
  const select=window.content.querySelector('.deliverySelect') as HTMLSelectElement;for(const site of DELIVERY_SITES){const option=document.createElement('option');option.value=site.id;option.textContent=site.name;select.append(option);}select.value=selectedDeliverySite().id;select.onchange=()=>{selectDeliverySite(select.value);update();window!.clamp();};
  (window.content.querySelector('.deliveryVisit') as HTMLElement).onclick=()=>{const state=getState(),record=state.history.find(e=>e.type==='delivery'&&e.siteId===selectedDeliverySite().id);if(record&&!state.practice){close();onVisit(record.probePartId);}};
  (window.content.querySelector('.deliveryFollow') as HTMLElement).onclick=()=>{followed=!followed;try{localStorage.setItem(key,followed?'1':'0');}catch{notify('案内表示の設定を保存できません');}update();};update();window.clamp();
 }
 centerButton.onclick=open;menuButton.onclick=open;hud.onclick=open;marker.onclick=open;
 function update(){
  const site=selectedDeliverySite(),{flight,history,practice,atCenter,world}=getState(),done=history.find(e=>e.type==='delivery'&&e.siteId===selectedDeliverySite().id);
  const precise=challenge==='precision',precisionDone=history.some(e=>e.type==='precision-landing'&&e.siteId===site.id);
  centerButton.textContent=(precise?precisionDone:done)?'探査計画 ✓':'探査計画';
  const d=flight?deliveryTelemetry(flight,history,{practice,site}):null;
  hud.hidden=!followed||!flight||atCenter;
  if(!hud.hidden){const center=flight!.pos.clone().add(flight!.stats.com.clone().applyQuaternion(flight!.q)),bearing=deliveryBearing(center,flight!.universalTime,site),distance=d!.distance<1000?Math.round(d!.distance)+' m':(d!.distance/1000).toFixed(1)+' km';hud.textContent=site.name+' · '+distance+(bearing===null?'':' · '+(Math.round(bearing)%360)+'°')+(precise?(siteApproachText(flight!,site)?' · '+siteApproachText(flight!,site):''):' · '+(done?'記録済み':d!.reason||'設置条件達成'));hud.title=precise?precisionLandingStatus(flight,history,site):'';}
  if(window){(window.content.querySelector('.precisionResult') as HTMLElement).textContent=practice?'練習中：達成記録の対象外':precisionLandingStatus(flight,history,site);(window.content.querySelector('.deliveryInstructions') as HTMLElement).hidden=!!done;(window.content.querySelector('.deliveryLocation') as HTMLElement).textContent='発射台から'+(site.east?'東へ '+(site.east/1000).toFixed(1)+' km':'北へ '+site.north+' m')+' · 半径'+site.radius+' m';(window.content.querySelector('.deliveryResult') as HTMLElement).textContent=done?'✓ 設置記録 · '+done.name:practice?'練習中：達成記録の対象外':d?d.reason||'設置条件達成':'未達成';(window.content.querySelector('.deliveryFollow') as HTMLElement).textContent=followed?'案内を非表示':'目的地を案内';const station=practice?null:deliveryStation(history,flight?fleet(flight):world?.vessels??[],site),text=window.content.querySelector('.deliveryStation') as HTMLElement,visit=window.content.querySelector('.deliveryVisit') as HTMLElement;
// world vessels (saved records) only reach observationStatus when !flight, i.e. paused, which reads just state/thermal/observations.
text.hidden=!station;visit.hidden=!station?.vessel;const survey=surveyProgress(history,practice?[]:flight?fleet(flight):world?.vessels??[],site);(window.content.querySelector('.surveyProgress') as HTMLElement).hidden=practice;for(const key of ['day','night'] as ('day'|'night')[]){const suffix=key==='day'?'Day':'Night',bar=window.content.querySelector('.survey'+suffix) as HTMLProgressElement;bar.max=SURVEY_TARGET_SECONDS;bar.value=survey[key];bar.setAttribute('aria-label',key==='day'?'日照の観測進捗':'夜間の観測進捗');(window.content.querySelector('.survey'+suffix+'Value') as HTMLElement).textContent=Math.min(150,Math.floor(survey[key]/60))+' / 150 分';}(window.content.querySelector('.surveyResult') as HTMLElement).textContent=survey.completed?'✓ 昼夜観測を完了':station?.vessel?(station.distance>site.radius?'この観測点の範囲外':observationStatus(station.vessel as DeliveryStationVessel,station.record.probePartId!,{paused:atCenter||!flight})):station?'観測機は現在の世界にありません':'観測機を設置してください';
const qualityPanel=window.content.querySelector('.surveyQuality') as HTMLElement;qualityPanel.hidden=practice;const rows=DELIVERY_SITES.flatMap(location=>{const progress=surveyProgress(history,flight?fleet(flight):world?.vessels??[],location);return ['day','night'].map(period=>{const q=qualitySummary(progress.quality,period),name=location.name.replace('観測点','')+' · '+(period==='day'?'日照':'夜間');return '<tr><th>'+name+'</th><td>'+(q?(q.received/60).toFixed(1)+'分':'—')+'</td><td>'+(q?(q.missed/60).toFixed(1)+'分':'—')+'</td><td>'+(q?.ratio!==null&&q?.ratio!==undefined?Math.round(q.ratio*100)+'%':'—')+'</td></tr>';});});const markup=rows.join('');if(markup!==qualityMarkup){(window.content.querySelector('.surveyQuality tbody') as HTMLElement).innerHTML=markup;qualityMarkup=markup;}
for(const selector of ['.deliveryResult','.deliveryStation','.deliveryVisit','.surveyProgress','.surveyQuality','.deliveryConditions','.deliveryInstructions']){const e=window.content.querySelector(selector) as HTMLElement;if(precise)e.hidden=true;}(window.content.querySelector('.precisionChallenge') as HTMLElement).hidden=!precise;(window.content.querySelector('.deliveryResult') as HTMLElement).hidden=precise;(window.content.querySelector('.deliveryConditions') as HTMLElement).hidden=precise;
if(station)text.textContent=station.vessel?(station.vessel.vesselName||'観測機')+' · '+(station.damaged?'損傷':station.landed?'接地':'飛行中')+' · 観測点から '+Math.round(station.distance)+' m · '+station.power.stored.toFixed(0)+' / '+station.power.capacity+' EC':'観測機は現在の世界にありません';}
 }
 function updateMarker(camera:import('three').Camera,width:number,height:number):void{const site=selectedDeliverySite();marker.textContent='◇ '+site.name;marker.setAttribute('aria-label',site.name+'の位置');const {flight,atCenter}=getState();const visible=followed&&flight&&!atCenter&&(root.querySelector('#orbitOverlay') as HTMLElement).hidden;const p=visible?projectDeliverySite(camera,flight.universalTime,width,height,site):null;marker.hidden=!p;if(p){marker.style.left=p.x+'px';marker.style.top=p.y+'px';
  // Keep the world anchor truthful; the guide still supplies distance/bearing
  // when another instrument occupies its projected screen position.
  const m=marker.getBoundingClientRect();
  marker.hidden=[...root.querySelectorAll('#flightQuickNav,.navpanel,.hudreadings,#inspector,#flightMenu,#flightSystems,#stageDock,.floatingWindow,#panelDock')].some(el=>{
   if(getComputedStyle(el).visibility==='hidden')return false;
   const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&m.left<r.right+4&&m.right>r.left-4&&m.top<r.bottom+4&&m.bottom>r.top-4;
  });
 }}
 return {update,close,updateMarker};
}

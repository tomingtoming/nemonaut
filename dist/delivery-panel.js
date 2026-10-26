import {floatingWindow} from './floating-window.js';
import {DELIVERY_SITE,deliveryBearing} from './delivery-sites.js';
import {deliveryTelemetry} from './surface-delivery.js';
const key='orbital-foundry-delivery-guide';
export function mountDeliveryPanel(root,getState,notify){
 let followed=false,window=null;try{followed=localStorage.getItem(key)==='1';}catch{}
 const centerButton=document.createElement('button');centerButton.id='centerDelivery';centerButton.textContent='探査計画';root.querySelector('#centerTracking').after(centerButton);
 const hud=document.createElement('button');hud.id='deliveryGuide';hud.hidden=true;hud.setAttribute('aria-label','観測点への案内');root.querySelector('#flightHud').append(hud);
 const menuButton=document.createElement('button');menuButton.textContent='探査計画';menuButton.id='flightDelivery';root.querySelector('#flightQuickNav').append(menuButton,hud);
 const close=()=>{window?.remove();window=null;};
 function open(){
  if(window){window.front();return;}
  window=floatingWindow(root.body,{title:'観測点を設置',x:innerWidth-340,y:100,onClose:close});window.element.classList.add('deliveryWindow');
  window.content.innerHTML='<h3>北観測点</h3><p>発射台から北へ600 m · 半径30 m</p><p>探査コアと太陽電池を届け、運搬機から分離して設置。</p><p class="deliveryResult" role="status"></p><button class="deliveryFollow"></button><details><summary>達成条件</summary><p>通常出発した部品で、車輪・主エンジンを残さず、電力のある観測機を無損傷で接地・静止させます。運搬方法は自由。設置した機体は世界に残ります。</p></details>';
  window.content.querySelector('.deliveryFollow').onclick=()=>{followed=!followed;try{localStorage.setItem(key,followed?'1':'0');}catch{notify('案内表示の設定を保存できません');}update();};update();window.clamp();
 }
 centerButton.onclick=open;menuButton.onclick=open;hud.onclick=open;
 function update(){
  const {flight,history,practice,atCenter}=getState(),done=history.find(e=>e.type==='delivery'&&e.siteId===DELIVERY_SITE.id);
  centerButton.textContent=done?'探査計画 ✓':'探査計画';
  const d=flight?deliveryTelemetry(flight,history,{practice}):null;
  hud.hidden=!followed||!flight||atCenter;
  if(!hud.hidden){const center=flight.pos.clone().add(flight.stats.com.clone().applyQuaternion(flight.q)),bearing=deliveryBearing(center,flight.universalTime),distance=d.distance<1000?Math.round(d.distance)+' m':(d.distance/1000).toFixed(1)+' km';hud.textContent=DELIVERY_SITE.name+' · '+distance+(bearing===null?'':' · '+(Math.round(bearing)%360)+'°')+' · '+(done?'設置済み':d.reason||'設置条件達成');}
  if(window){window.content.querySelector('.deliveryResult').textContent=done?'✓ 設置完了 · '+done.name:practice?'練習中：達成記録の対象外':d?d.reason||'設置条件達成':'未達成';window.content.querySelector('.deliveryFollow').textContent=followed?'案内を非表示':'目的地を案内';}
 }
 return {update,close};
}

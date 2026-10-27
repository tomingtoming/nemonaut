import {runwaySelection,runwaySelector} from './runway-selection.js';
import {floatingWindow} from './floating-window.js';
import {runwayApproach} from './runway-navigation.js';
import {drawRunwayMap} from './runway-map.js';
export function mountRunwayPanel(root,getState){
 let window=null;
 const button=document.createElement('button');button.id='openRunwayGuide';button.textContent='滑走路';
 root.querySelector('#flightSystems').append(button);
 const close=()=>{window?.remove();window=null;};
 function update(){
  const {flight,atCenter}=getState(),end=runwaySelection.end;button.hidden=!flight||atCenter;
  if(button.hidden){close();return;}if(!window)return;window.content.querySelector('select').value=end;
  const point=flight.stats.com.clone().applyQuaternion(flight.q).add(flight.pos);
  const v=runwayApproach(point,flight.universalTime,end,flight.vel),out=window.content.querySelector('output');
  drawRunwayMap(window.content.querySelector('canvas'),v,end);
  if(!v){out.textContent='母星の滑走路 · 圏外';return;}
  const bearing=v.bearing===null?'—':String(Math.round(v.bearing)%360).padStart(3,'0')+'°';
  out.textContent=`滑走路端まで ${(v.distance/1000).toFixed(2)} km · ${bearing}\n${v.remaining>=0?'端の手前':'端の奥'} ${(Math.abs(v.remaining)/1000).toFixed(2)} km\n中心線の${Math.abs(v.crossTrack)<.5?'上':v.crossTrack>0?'右':'左'} ${Math.abs(v.crossTrack).toFixed(0)} m`;
 }
 button.onclick=()=>{
  if(window){window.front();return;}
  window=floatingWindow(root.body,{title:'滑走路',x:innerWidth-310,y:155,onClose:close});
  window.element.classList.add('runwayWindow');
  const select=runwaySelector(root);
  const map=document.createElement('canvas');map.width=240;map.height=160;map.style.cssText='display:block;width:100%;height:auto;margin:8px 0';map.setAttribute('role','img');map.title='着陸方向が上。水色の点は機体、矢印は対地進路。自動縮尺。';
  window.content.append(select,map,document.createElement('output'));update();
 };
 runwaySelection.subscribe(update);
 return {update,close};
}

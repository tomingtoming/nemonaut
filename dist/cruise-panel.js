import {floatingWindow} from './floating-window.js';
import {CruisePilot,cruiseReadiness,cruiseSettings} from './cruise-pilot.js';
import {compassHeading} from './navigation.js';
import {bodyAltitude} from './celestial.js';
import {surfaceRelativeVelocity} from './surface-frame.js';
import {acceptsFlightKey} from './flight-keyboard.js';
import {PARTS} from './catalog.js';
import * as T from 'three';

export function mountCruisePanel(root,getState,{claim,sync}){
 let panel=null,pilot=null,owner=null,shown=null,message='待機';
 const button=root.createElement('button');button.id='openCruise';button.textContent='自動操縦';root.querySelector('#flightSystems').append(button);
 const close=()=>{panel?.remove();panel=null;shown=null;};
 const stop=(reason='手動操縦')=>{if(pilot){pilot.stop(owner,reason==='異常停止'?'fault':'manual');pilot=null;message=reason;sync();}};
 function defaults(f){
  const heading=compassHeading(new T.Vector3(0,0,1).applyQuaternion(f.q),f.pos,f.universalTime)??90;
  return f.cruiseSettings??{speed:Math.round(Math.max(40,Math.min(350,surfaceRelativeVelocity(f.pos,f.vel,f.universalTime).length()))),altitude:Math.round(Math.max(300,Math.min(15000,bodyAltitude(f.pos,f.universalTime)))),heading:Math.round(heading)%360,mode:'altitude',vertical:0};
 }
 function render(f){
  panel.content.replaceChildren();const settings=defaults(f),inputs={};
  for(const [key,label,min,max,step]of [['speed','対気速度 m/s',40,350,1],['altitude','高度 m',300,15000,10],['vertical','昇降率 m/s',-10,10,.5],['heading','針路 °',0,359,1]]){
   const row=root.createElement('label'),input=root.createElement('input');row.textContent=label;input.type='number';input.min=min;input.max=max;input.step=step;input.value=settings[key];input.setAttribute('aria-label',label);input.style.width='90px';row.style.cssText='display:flex;justify-content:space-between;gap:12px;margin:6px 0';row.append(input);panel.content.append(row);inputs[key]=input;
  }
  const mode=root.createElement('select');mode.setAttribute('aria-label','垂直制御');for(const [value,label]of [['altitude','高度保持'],['vertical','昇降率保持']]){const o=root.createElement('option');o.value=value;o.textContent=label;mode.append(o);}mode.value=settings.mode;
  const apply=()=>{try{const next=cruiseSettings({...Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,Number(v.value)])),mode:mode.value});f.cruiseSettings=next;if(pilot&&owner===f){pilot.target={...next};pilot.duration=0;pilot.settled=0;}message='待機';}catch(error){message=error.message;}update();};
  for(const input of Object.values(inputs)){input.oninput=apply;input.onchange=apply;}mode.onchange=apply;
  const start=root.createElement('button');start.id='cruiseStart';start.textContent='開始';start.onclick=()=>{try{const next=cruiseSettings({...Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,Number(v.value)])),mode:mode.value});const reason=cruiseReadiness(f);if(reason){message=reason;update();return;}claim();stop();owner=f;f.cruiseSettings=next;pilot=new CruisePilot(f,next);message='捕捉中';sync();}catch(error){message=error.message;}update();};
  const halt=root.createElement('button');halt.textContent='停止';halt.onclick=()=>{stop();update();};
  const out=root.createElement('output');out.id='cruiseStatus';out.style.cssText='display:block;margin-top:8px';panel.content.append(mode,start,halt,out);shown=f;
 }
 function update(){const {flight:f,atCenter}=getState();if(pilot&&owner!==f)stop('機体切替 · 待機');button.hidden=!f||atCenter||f.rocketAxes;if(button.hidden){close();return;}button.textContent=pilot?'自動操縦 · '+pilot.status:'自動操縦';if(!panel)return;if(shown!==f)render(f);const out=panel.content.querySelector('output');out.textContent=pilot?pilot.status:(cruiseReadiness(f)||message);panel.content.querySelector('#cruiseStart').disabled=!!pilot;}
 function step(f,dt){
  if(!pilot)return;if(f!==owner){stop('機体切替 · 待機');return;}
  if(f.crashed||!f.parts.some(p=>PARTS[p.type].aircraftControl)){stop('異常停止');return;}
  const wasSas=f.sas,wasMode=f.sasMode;pilot.update(f,dt);if(!pilot.running){const detail=pilot.faultMessage;stop('異常停止');if(detail)message='異常停止 · '+detail;}else if(wasSas!==f.sas||wasMode!==f.sasMode)sync();
 }
 button.onclick=()=>{if(panel){panel.front();return;}panel=floatingWindow(root.body,{title:'巡航保持',x:innerWidth-330,y:150,onClose:close});render(getState().flight);update();};
 const direct='#throttle,#trim,#sas,#sasDirections,#stage,#autoLaunch,#autoReturn,#navigationFrame,#navigationAuto,#brake';
 for(const type of ['input','click'])root.addEventListener(type,e=>{if(e.target.closest?.(direct)){stop();update();}},true);
 window.addEventListener('keydown',e=>{if(!acceptsFlightKey(e.target,e.code))return;if(/^(Key[WASDQEZXTB]|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(e.code)){
  const controlled=pilot?owner:null;stop();
  // Floating windows stop bubbling keyboard events. Preserve the throttle
  // command that releases cruise even when a window button owns focus.
  if(controlled&&['KeyX','KeyZ'].includes(e.code)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){controlled.throttle=e.code==='KeyX'?0:1;sync();}
  update();
 }},true);
 return {update,step,stop,close,get active(){return !!pilot;}};
}

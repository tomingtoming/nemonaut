import {AscentSession} from './orbital-ascent-controller.js';
import {orbitalAscentSettings} from './orbital-ascent-settings.js';
import {floatingWindow} from './floating-window.js';
import {acceptsFlightKey} from './flight-keyboard.js';

export function mountOrbitalAscent(root,getState,{claim,sync,onRemoved}){
 const session=new AscentSession(),button=root.createElement('button');
 button.textContent='自動投入';root.querySelector('#flightSystems').append(button);
 let panel=null,shown=null,bound=null,message='待機';
 const close=()=>{panel?.remove();panel=null;shown=null;};
 const stop=()=>{if(session.owner){session.stop();message='待機';sync();}};
 function render(f){
  panel.content.replaceChildren();shown=f;const settings=orbitalAscentSettings(f.orbitalAscentSettings??{}),inputs={};
  for(const [key,label,min,max,value]of [['altitude','軌道高度 km',80,500,settings.altitude/1000],['inclination','軌道傾斜角 °',0,180,settings.inclination]]){
   const row=root.createElement('label'),input=root.createElement('input');row.textContent=label;input.type='number';input.min=min;input.max=max;input.step=1;input.value=value;input.setAttribute('aria-label',label);input.style.width='90px';row.style.cssText='display:flex;justify-content:space-between;gap:12px;margin:6px 0';row.append(input);panel.content.append(row);inputs[key]=input;
  }
  const read=()=>{if(Object.values(inputs).some(input=>input.value.trim()===''))throw Error('目標を入力してください');return orbitalAscentSettings({altitude:Number(inputs.altitude.value)*1000,inclination:Number(inputs.inclination.value)});};
  for(const input of Object.values(inputs))input.onchange=()=>{stop();try{f.orbitalAscentSettings=read();message='待機';}catch(e){message=e.message;}update();};
  const start=root.createElement('button'),halt=root.createElement('button'),status=root.createElement('output');
  start.textContent='投入開始';halt.textContent='停止';status.setAttribute('role','status');
  start.onclick=()=>{try{const settings=read();session.start(f,settings);f.orbitalAscentSettings=settings;claim();message='離昇';}catch(e){message=e.message;}update();};
  halt.onclick=()=>{stop();update();};panel.content.append(start,halt,status);
 }
 function update(){
  const {flight:f,atCenter}=getState();if(session.owner&&(session.owner!==f||atCenter))stop();
  if(bound!==f){bound=f;message='待機';}
  button.hidden=!f||atCenter||!f.rocketAxes;
  if(button.hidden){close();return;}
  button.textContent=session.owner?'自動投入 · '+session.pilot.phase:'自動投入';
  if(!panel)return;if(shown!==f){message='待機';render(f);}
  panel.content.querySelector('output').textContent=session.owner?session.message:message;
  panel.content.querySelector('button').disabled=!!session.owner;
 }
 function step(f,dt){
  if(!session.owner)return;const ids=new Set(f.parts.map(p=>p.id)),was=session.owner,stage=f.stage,sas=f.sas;
  session.step(f,dt);for(const id of ids)if(!f.parts.some(p=>p.id===id))onRemoved(id);
  if(was&&!session.owner)message=session.message;
  if(stage!==f.stage||sas!==f.sas||!session.owner)sync();
 }
 button.onclick=()=>{if(panel){panel.front();return;}panel=floatingWindow(root.body,{title:'自動投入',x:innerWidth-330,y:150,onClose:close});render(getState().flight);update();};
 const direct='#throttle,#trim,#sas,#sasDirections,#sasMode,#stage,#autoLaunch,#autoReturn,#navigationFrame,#navigationAuto,#brake,#mapCutoff,#alignManeuver';
 for(const type of ['input','click','change'])root.addEventListener(type,e=>{if(e.target.closest?.(direct))stop();},true);
 window.addEventListener('keydown',e=>{
  if(!session.owner||!acceptsFlightKey(e.target,e.code)||! /^(Key[WASDQEZXTB]|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(e.code))return;
  const f=session.owner;stop();if(['KeyX','KeyZ'].includes(e.code)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){f.throttle=e.code==='KeyZ'?1:0;sync();}update();
 },true);
 return {update,step,stop,close,get active(){return !!session.owner;}};
}

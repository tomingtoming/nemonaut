import {ManeuverSession,type ManeuverFlight,type ManeuverNode} from './maneuver-controller.js';
import {maneuverWarpBudget} from './maneuver-warp.js';
import {floatingWindow,type FloatingWindow} from './floating-window.js';
import {acceptsFlightKey} from './flight-keyboard.js';
import {preserveManualControlEdit} from './manual-control-edit.js';
import {element} from './dom.js';

export interface ManeuverPanelFlight extends ManeuverFlight{rocketAxes?:unknown}
export interface ManeuverPanelState{flight:ManeuverPanelFlight|null|undefined;atCenter:boolean}
export interface ManeuverPanelHooks{claim():void;sync():void}
export interface ManeuverPanel{update():void;step(f:ManeuverPanelFlight,dt:number):void;stop():void;close():void;readonly active:boolean;warpBudget(f:ManeuverPanelFlight):number}
export function mountManeuverPanel(root:Document,getState:()=>ManeuverPanelState,{claim,sync}:ManeuverPanelHooks):ManeuverPanel{
 const session=new ManeuverSession(),button=root.createElement('button');button.textContent='自動噴射';const systems=root.querySelector('#flightSystems');if(!systems)throw Error('画面要素が見つかりません: #flightSystems');systems.append(button);
 let panel:FloatingWindow|null=null,bound:ManeuverPanelFlight|null|undefined=null,node:ManeuverNode|null|undefined=null,message='待機',power:HTMLSelectElement|null=null,timing:HTMLSelectElement|null=null,start:HTMLButtonElement|null=null,status:HTMLOutputElement|null=null,readout:HTMLParagraphElement|null=null;
 const close=()=>{panel?.remove();panel=null;};
 const stop=()=>{if(session.owner){session.stop();message='待機';sync();}};
 const fixed=(n:ManeuverNode|null|undefined)=>!!(n?.capture||n?.returnPlan||n?.departure||n?.rendezvous||n?.plannedThrottle!==undefined);
 function update(){
  const {flight:f,atCenter}=getState();
  if(session.owner&&(session.owner!==f||atCenter||session.node!==f?.maneuver))stop();
  if(bound!==f||node!==f?.maneuver){bound=f;node=f?.maneuver;message='待機';if(panel)configure();}
  button.hidden=!f||atCenter||!f.rocketAxes;if(button.hidden){close();return;}
  button.textContent=session.owner?'自動噴射 · '+session.message:'自動噴射';
  if(!panel)return;
  start!.disabled=!!session.owner||!node||node.complete;
  power!.disabled=timing!.disabled=fixed(node)||!!session.owner;
  status!.textContent=session.owner?session.message:!node?'マップで計画を固定してください':message;
  readout!.textContent=node?`残り ${Math.hypot(...node.remaining).toFixed(2)} m/s`+(session.owner?(session.plan!.onAlignment&&!session.lit?' · 姿勢がそろい次第開始':` · 開始まで ${Math.max(0,session.plan!.startTime-f!.universalTime).toFixed(1)}秒`):''):'';
 }
 function configure(){if(!power||!timing)throw Error('自動噴射の窓がありません');element(power,'[value="1"]','option').textContent=node?.returnPlan||node?.departure||node?.rendezvous?.burnThrottle===null?'100→10→1%':'100%';power.value=String(fixed(node)?(node!.rendezvous?(node!.rendezvous.burnThrottle??1):node!.plannedThrottle??1):.1);timing.value=fixed(node)?'start':'center';}
 function open(){
  if(panel){panel.front();return;}
  panel=floatingWindow(root.body,{title:'自動噴射',x:innerWidth-330,y:160,onClose:close});
  power=root.createElement('select');power.setAttribute('aria-label','自動噴射の推力');
  for(const [value,label]of [[.01,'1%'],[.1,'10%'],[1,'100%']] as const){const option=root.createElement('option');option.value=String(value);option.textContent=label;power.append(option);}
  timing=root.createElement('select');timing.setAttribute('aria-label','自動噴射の時刻基準');
  for(const [value,label]of [['center','中央基準'],['start','開始基準']]){const option=root.createElement('option');option.value=value;option.textContent=label;timing.append(option);}
  start=root.createElement('button');start.textContent='実行開始';const halt=root.createElement('button');halt.textContent='停止';
  status=root.createElement('output');status.setAttribute('role','status');readout=root.createElement('p');
  start.onclick=()=>{const f=getState().flight;try{session.start(f,{throttle:Number(power!.value),timing:timing!.value});claim();session.previous={sas:f!.sas,sasMode:f!.sasMode,navigationAuto:f!.navigationAuto,navigationFrame:f!.navigationFrame};message='姿勢合わせ';}catch(e){message=(e as Error).message;}update();};
  halt.onclick=()=>{stop();update();};power.onchange=timing.onchange=()=>{stop();message='待機';update();};
  panel.content.append(power,timing,start,halt,readout,status);configure();update();
 }
 function step(f:ManeuverPanelFlight,dt:number){if(!session.owner)return;const phase=session.state;session.step(f,dt);if(!session.owner)message=session.message;if(phase!==session.state)sync();}
 button.onclick=open;
 const direct='#throttle,#trim,#sas,#sasDirections,#sasMode,#stage,#autoLaunch,#autoReturn,#navigationFrame,#navigationAuto,#brake,#rcsEnabled,#reactionEnabled,#mapCutoff,#alignManeuver,#fixManeuver,#clearManeuver,#transferIgnite,#transferFine,#transferCutoff,#capturePanel button,#returnPanel button,#departurePanel button';
 for(const type of ['input','click','change'])root.addEventListener(type,e=>{
  if(!session.owner||!(e.target as HTMLInputElement).closest?.(direct))return;
  preserveManualControlEdit(e.target as HTMLInputElement,stop);
 },true);
 window.addEventListener('keydown',e=>{
  if(!session.owner||!acceptsFlightKey(e.target,e.code)||!/^(Key[WASDQEZXTBHRIJKLUO]|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(e.code))return;
  const f=session.owner;stop();if(['KeyX','KeyZ'].includes(e.code)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){f.throttle=e.code==='KeyZ'?1:0;sync();}update();
 },true);
 return {update,step,stop,close,get active(){return !!session.owner;},warpBudget:f=>maneuverWarpBudget(session,f)};
}

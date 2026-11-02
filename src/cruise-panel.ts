import {runwaySelection,runwaySelector,type RunwayFlight} from './runway-selection.js';
import {floatingWindow,type FloatingWindow} from './floating-window.js';
import {CruisePilot,cruiseReadiness,cruiseSettings,cruiseTargetReadiness,cruiseAuthority,cruisePropulsion,type CruiseFlight,type CruiseSettings,type CruisePrevious} from './cruise-pilot.js';
import {TakeoffSession,TakeoffPreviewClient,departureReadiness,LandingSession,LandingPlanClient,landingReadiness,ReturnSession,returnReadiness,type TakeoffPilot,type AutopilotCommands} from './takeoff-controller.js';
import {compassHeading} from './navigation.js';
import {bodyAltitude} from './celestial.js';
import {surfaceRelativeVelocity} from './surface-frame.js';
import {acceptsFlightKey} from './flight-keyboard.js';
import {preserveManualControlEdit,type ManualControl} from './manual-control-edit.js';
import {PARTS,type PartCatalog} from './catalog.js';
import * as T from 'three';
export interface CruisePanelFlight extends CruiseFlight,RunwayFlight{environment:string;cruiseSettings?:CruiseSettings|null;rocketAxes:boolean}
export interface CruisePanelState{flight:CruisePanelFlight|null|undefined;atCenter:boolean}
export interface CruisePanelHooks{claim():void;sync():void}
export interface CruisePanel{update():void;step(f:CruisePanelFlight,dt:number):AutopilotCommands|undefined;stop(reason?:string):void;close():void;readonly active:boolean}
type CruiseNumberKey=Exclude<keyof CruiseSettings,'mode'>;
type NumberFieldInput=Omit<HTMLInputElement,'min'|'max'|'step'|'value'>&{min:string|number;max:string|number;step:string|number;value:string|number};
type ControlEventTarget=EventTarget&ManualControl&{closest?(selectors:string):Element|null};

export function mountCruisePanel(root:Document,getState:()=>CruisePanelState,{claim,sync}:CruisePanelHooks):CruisePanel{
 let panel:FloatingWindow|null=null,pilot:CruisePilot|null=null,owner:CruisePanelFlight|null=null,shown:CruisePanelFlight|null=null,message='待機',inputError:string|null=null;
 let takeoff:TakeoffPilot|null=null,takeoffPrevious:CruisePrevious|null=null,landingNotice:string|null=null;
 const departure=new TakeoffSession(new TakeoffPreviewClient(()=>new Worker(new URL('./takeoff-forecast-worker.js',import.meta.url),{type:'module'})));
 const landing=new LandingSession(new LandingPlanClient(()=>new Worker(new URL('./landing-plan-worker.js',import.meta.url),{type:'module'})));
 const returning=new ReturnSession(new LandingPlanClient(()=>new Worker(new URL('./landing-plan-worker.js',import.meta.url),{type:'module'})));
 const returnStatus=()=>returning.owner?(({return:'帰投',capture:'進入へ整列',planning:'着陸計算中',approach:'進入',rollout:'着陸滑走','go-around':'復行',recovery:'高度600 mへ回復','recovery-hold':'回復後の保持'} as Record<string,string>)[returning.state]||returning.state):null;
 const activeLanding=()=>returning.landing.pilot?returning.landing:landing;
 const landingStatus=()=>(({approach:'進入',rollout:'着陸滑走','go-around':'復行',recovery:'復行後の高度捕捉','recovery-hold':'復行後の保持'} as Record<string,string>)[landing.pilot?.phase as string]);
 const takeoffStatus=()=>takeoff?.cruise&&Math.abs(takeoff.cruise.target.speed-takeoff.target.speed)>1?'捕捉中':takeoff?.cruise?.status??(({roll:'滑走',rotate:'機首上げ',climb:'上昇',capture:'巡航へ移行',abort:'離陸中止',stopped:'停止'} as Record<string,string>)[takeoff?.phase as string]??'待機');
 const button=root.createElement('button');button.id='openCruise';button.textContent='自動操縦';root.querySelector('#flightSystems')!.append(button);
 const close=()=>{panel?.remove();panel=null;shown=null;};
 const stop=(reason='手動操縦')=>{landingNotice=null;const pending=departure.state!=='idle'||landing.state!=='idle'||!!returning.owner,wasLanding=!!landing.pilot||!!returning.owner;returning.stop(reason==='異常停止'?'fault':'manual');departure.cancel();landing.stop(reason==='異常停止'?'fault':'manual');if(wasLanding)sync();if(takeoff){Object.assign(owner!,takeoffPrevious);owner!.holdQ=owner!.q.clone();if(reason==='異常停止')owner!.throttle=0;takeoff=null;message=reason;sync();}if(pilot){pilot.stop(owner!,reason==='異常停止'?'fault':'manual');pilot=null;message=reason;sync();}else if(pending)message=reason;};
 function defaults(f:CruisePanelFlight):CruiseSettings{
  const heading=compassHeading(new T.Vector3(0,0,1).applyQuaternion(f.q),f.pos,f.universalTime)??90;
  if(f.cruiseSettings)return f.cruiseSettings;
  const ground=f.environment==='runway'&&bodyAltitude(f.pos,f.universalTime)<30;
  const value={speed:Math.round(Math.max(ground?90:40,Math.min(350,surfaceRelativeVelocity(f.pos,f.vel,f.universalTime).length()))),altitude:ground?600:Math.round(Math.max(300,Math.min(15000,bodyAltitude(f.pos,f.universalTime)))),heading:Math.round(heading)%360,mode:'altitude',vertical:0};
  while(ground&&value.speed<350&&cruiseTargetReadiness(f,value))value.speed+=5;return value;
 }
 function render(f:CruisePanelFlight){
  inputError=null;panel!.content.replaceChildren();const settings=defaults(f),inputs:Record<string,NumberFieldInput>={};
  for(const [key,label,min,max,step]of [['speed','対気速度 m/s',40,350,1],['altitude','高度 m',300,15000,10],['vertical','昇降率 m/s',-10,10,.5],['heading','針路 °',0,359,1]] as [CruiseNumberKey,string,number,number,number][]){
   const row=root.createElement('label'),input=root.createElement('input') as NumberFieldInput;row.textContent=label;input.type='number';input.min=min;input.max=max;input.step=step;input.value=settings[key];input.setAttribute('aria-label',label);input.style.width='90px';row.style.cssText='display:flex;justify-content:space-between;gap:12px;margin:6px 0';row.append(input);panel!.content.append(row);inputs[key]=input;
  }
  const mode=root.createElement('select');mode.setAttribute('aria-label','垂直制御');for(const [value,label]of [['altitude','高度保持'],['vertical','昇降率保持']]){const o=root.createElement('option');o.value=value;o.textContent=label;mode.append(o);}mode.value=settings.mode;
  const settingsNow=()=>cruiseSettings({...Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,Number(v.value)])),mode:mode.value});
  const apply=()=>{departure.cancel();if(takeoff||landing.pilot||returning.owner)stop();try{const next=settingsNow();const problem=cruiseTargetReadiness(f,next);if(problem)throw Error(problem);inputError=null;f.cruiseSettings=next;if(pilot&&owner===f){pilot.target={...next};pilot.duration=0;pilot.settled=0;}message='待機';}catch(error){inputError=(error as Error).message;}update();};
  for(const input of Object.values(inputs)){input.oninput=apply;input.onchange=apply;}mode.onchange=apply;
  const start=root.createElement('button');start.id='cruiseStart';start.textContent='開始';start.onclick=()=>{try{const next=cruiseSettings({...Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,Number(v.value)])),mode:mode.value});inputError=null;const reason=cruiseReadiness(f)||cruiseTargetReadiness(f,next);if(reason){message=reason;update();return;}claim();stop();owner=f;f.cruiseSettings=next;pilot=new CruisePilot(f,next);message='捕捉中';sync();}catch(error){inputError=(error as Error).message;}update();};
  const halt=root.createElement('button');halt.textContent='停止';halt.onclick=()=>{stop();update();};
  const predict=root.createElement('button');predict.id='takeoffForecast';predict.textContent='離陸予測';
  predict.onclick=async()=>{stop();owner=f;inputError=null;message='予測中';update();try{const next=settingsNow();f.cruiseSettings=next;const result=await departure.prepare(f,next);if(getState().flight!==f)return;if(result.status==='cancelled')return;message=result.status==='stale'?'状態が変わりました · 再予測':result.accepted?'離陸準備完了':result.status==='airborne'?'滑走路の余裕不足':'離陸を予測できません';}catch(error){inputError=(error as Error).message;}update();};
  const depart=root.createElement('button');depart.id='takeoffStart';depart.textContent='離陸開始';
  depart.onclick=()=>{try{inputError=null;const next=settingsNow(),candidate=departure.start(f,next);claim();if(pilot){pilot.stop(owner!);pilot=null;}owner=f;takeoffPrevious={sas:f.sas,sasMode:f.sasMode,trim:f.trim};takeoff=candidate;message='滑走';sync();}catch(error){inputError=(error as Error).message;}update();};
  const prepareLanding=root.createElement('button');prepareLanding.id='landingPrepare';prepareLanding.textContent='着陸準備';
  prepareLanding.onclick=async()=>{owner=f;inputError=null;message='着陸計算中';landingNotice=null;try{const pending=landing.prepare(f,{end:runwaySelection.end});update();const result=await pending;if(getState().flight!==f||result.status==='cancelled')return;landingNotice=result.status==='ready'?`着陸準備完了 · ${runwaySelection.end}`:result.status==='stale'?'進入状態が変わりました · 再準備':'着陸速度を算出できません';}catch(error){inputError=(error as Error).message;}update();};
  const land=root.createElement('button');land.id='landingStart';land.textContent='着陸開始';
  land.onclick=()=>{try{inputError=null;if(!landing.readyFor(f))throw Error('進入状態が変わりました。着陸を再準備してください');claim();departure.cancel();if(pilot){pilot.stop(owner!);pilot=null;}if(takeoff){Object.assign(owner!,takeoffPrevious);owner!.holdQ=owner!.q.clone();takeoff=null;}owner=f;landing.start(f);landingNotice=null;message='進入';sync();}catch(error){inputError=(error as Error).message;}update();};
  const returnButton=root.createElement('button');returnButton.id='aircraftReturn';returnButton.textContent='帰投・着陸';
 returnButton.onclick=()=>{try{inputError=null;const next=settingsNow(),reason=returnReadiness(f,next.speed,runwaySelection.end);if(reason)throw Error(reason);claim();stop();owner=f;returning.start(f,{speed:next.speed,end:runwaySelection.end});message='帰投';sync();}catch(error){inputError=(error as Error).message;}update();};
 const goAround=root.createElement('button');goAround.id='landingGoAround';goAround.textContent='復行';goAround.onclick=()=>{activeLanding().goAround(f);update();};
  const out=root.createElement('output');out.id='cruiseStatus';out.style.cssText='display:block;margin-top:8px';const direction=runwaySelector(root);direction.id='autopilotRunwayEnd';panel!.content.append(mode,direction,start,predict,depart,returnButton,prepareLanding,land,goAround,halt,out);shown=f;
 }
 function update():void{const {flight:f,atCenter}=getState();if((pilot||takeoff||returning.owner||departure.state!=='idle'||landing.state!=='idle')&&(owner!==f||atCenter))stop('機体切替 · 待機');runwaySelection.bind(f);button.hidden=!f||atCenter||f.rocketAxes;if(button.hidden){close();return;}const status=returnStatus()||landingStatus()||(takeoff?takeoffStatus():pilot?.status);button.textContent=status?'自動操縦 · '+status:'自動操縦';if(!panel)return;if(shown!==f)render(f!);panel.content.querySelector<HTMLSelectElement>('#autopilotRunwayEnd')!.value=runwaySelection.end;const ground=f!.environment==='runway'&&bodyAltitude(f!.pos,f!.universalTime)<30;
  if(departure.state==='ready'&&!departure.readyFor(f!,defaults(f!)))message='状態が変わりました · 再予測';
  if(landing.state==='ready'&&!landing.readyFor(f!))landingNotice='進入状態が変わりました · 再準備';
  const preparing=landing.state==='planning'?'着陸計算中':landing.state==='ready'?`着陸準備完了 · ${runwaySelection.end}`:null;
  const out=panel.content.querySelector('output')!;out.textContent=inputError||(returning.owner&&returning.message)||preparing||landingNotice||status||(message==='待機'?((ground?departureReadiness(f!,defaults(f!)):cruiseReadiness(f!))||message):message);
  panel.content.querySelector<HTMLButtonElement>('#cruiseStart')!.disabled=!!pilot||!!takeoff||!!landing.pilot||!!returning.owner||landing.state==='planning'||departure.state==='predicting';
  panel.content.querySelector<HTMLButtonElement>('#takeoffForecast')!.hidden=!ground;panel.content.querySelector<HTMLButtonElement>('#takeoffForecast')!.disabled=!!pilot||!!takeoff||!!landing.pilot||!!returning.owner||landing.state==='planning'||departure.state==='predicting';
  panel.content.querySelector<HTMLButtonElement>('#landingPrepare')!.hidden=ground;panel.content.querySelector<HTMLButtonElement>('#landingPrepare')!.disabled=!!landing.pilot||!!returning.owner||landing.state==='planning';panel.content.querySelector<HTMLButtonElement>('#landingPrepare')!.title=landingReadiness(f!,runwaySelection.end)||'';
  panel.content.querySelector<HTMLButtonElement>('#landingGoAround')!.hidden=!activeLanding().pilot;panel.content.querySelector<HTMLButtonElement>('#landingGoAround')!.disabled=activeLanding().pilot?.phase!=='approach';
  panel.content.querySelector<HTMLButtonElement>('#landingStart')!.hidden=ground;panel.content.querySelector<HTMLButtonElement>('#landingStart')!.disabled=landing.state!=='ready'||!!returning.owner;
  panel.content.querySelector<HTMLButtonElement>('#takeoffStart')!.hidden=!ground;panel.content.querySelector<HTMLButtonElement>('#takeoffStart')!.disabled=departure.state!=='ready'||!!pilot||!!takeoff||!!returning.owner;
  panel.content.querySelector<HTMLButtonElement>('#aircraftReturn')!.hidden=ground;panel.content.querySelector<HTMLButtonElement>('#aircraftReturn')!.disabled=!!returning.owner||!!landing.pilot||landing.state==='planning'||departure.state==='predicting';panel.content.querySelector<HTMLButtonElement>('#aircraftReturn')!.title=returnReadiness(f!,defaults(f!).speed,runwaySelection.end)||'';
 }
 function step(f:CruisePanelFlight,dt:number):AutopilotCommands|undefined{
  if(returning.owner){const wasSas=f.sas,wasMode=f.sasMode,commands=returning.step(f,dt);if(!returning.owner){message=returning.state==='landed'?'着陸完了':returning.state==='failed'?'異常停止 · '+(returning.message||'制御不能'):'待機';sync();}else if(wasSas!==f.sas||wasMode!==f.sasMode)sync();return commands;}
  if(landing.pilot){const wasSas=f.sas,wasMode=f.sasMode,commands=landing.step(f,dt);if(!landing.pilot){message=landing.state==='landed'?'着陸完了':landing.state==='failed'?'異常停止 · '+(landing.faultMessage||'制御不能'):'待機';sync();}else if(wasSas!==f.sas||wasMode!==f.sasMode)sync();return commands;}
  if(takeoff){if(f!==owner){stop('機体切替 · 待機');return {};}const fault=cruiseAuthority(f)||cruisePropulsion(f);if(fault){stop('異常停止');message=fault;return {};}const wasSas=f.sas,wasMode=f.sasMode;const commands=takeoff.update(f,dt);if(takeoff.phase==='stopped')stop('異常停止');else if(wasSas!==f.sas||wasMode!==f.sasMode)sync();return commands;}
  if(!pilot)return;if(f!==owner){stop('機体切替 · 待機');return;}
  if(f.crashed||!f.parts.some(p=>(PARTS as PartCatalog)[p.type].aircraftControl)){stop('異常停止');return;}
  const wasSas=f.sas,wasMode=f.sasMode;pilot.update(f,dt);if(!pilot.running){const detail=pilot.faultMessage;stop('異常停止');if(detail)message='異常停止 · '+detail;}else if(wasSas!==f.sas||wasMode!==f.sasMode)sync();
 }
 button.onclick=()=>{if(panel){panel.front();return;}panel=floatingWindow(root.body,{title:'自動操縦',x:innerWidth-330,y:150,onClose:close});render(getState().flight!);update();};
 const direct='#throttle,#trim,#sas,#sasDirections,#stage,#autoLaunch,#autoReturn,#navigationFrame,#navigationAuto,#brake';
 for(const type of ['input','click'])root.addEventListener(type,e=>{if((e.target as ControlEventTarget).closest?.(direct))preserveManualControlEdit(e.target as ControlEventTarget,()=>{stop();update();});},true);
 window.addEventListener('keydown',e=>{if(!acceptsFlightKey(e.target,e.code))return;if(/^(Key[WASDQEZXTB]|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(e.code)){
  const controlled=pilot||takeoff||landing.pilot||returning.owner?owner:null;stop();
  // Floating windows stop bubbling keyboard events. Preserve the throttle
  // command that releases cruise even when a window button owns focus.
  if(controlled&&['KeyX','KeyZ'].includes(e.code)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){controlled.throttle=e.code==='KeyX'?0:1;sync();}
  update();
 }},true);
 runwaySelection.subscribe(()=>{if(landing.state!=='idle'||returning.owner)stop('着陸方向変更 · 待機');inputError=null;landingNotice=null;update();});
 return {update,step,stop,close,get active(){return !!pilot||!!takeoff||!!landing.pilot||!!returning.owner;}};
}

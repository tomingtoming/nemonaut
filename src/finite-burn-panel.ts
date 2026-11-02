import {finiteReturnPlan} from './finite-return-plan.js';
import * as T from 'three';
import {finiteBurnPreview,type FiniteBurnVessel,type FiniteBurnPreview} from './finite-burn.js';
import {captureBurnEstimate} from './lunar-capture.js';
export type FiniteBurnPanelPart=import('./part-settings.js').SettablePart&{fuelCrossfeed?:boolean};
export interface FiniteBurnPanelFlight extends FiniteBurnVessel{parts:FiniteBurnPanelPart[];vesselId:string;time:number;stage:number}
export interface FiniteBurnContext{impulse:T.Vector3;epoch:number;tolerance:number}
export interface FiniteBurnPendingReturn{vesselId:string;epoch:number;impulse:T.Vector3;throttle:number}
export interface FiniteBurnPanel{plannedThrottle(preview:Pick<import('./maneuver.js').ManeuverPreview,'universalTime'|'impulse'>):number|undefined;update(preview:Pick<import('./maneuver.js').ManeuverPreview,'universalTime'|'impulse'>|null|undefined,node:import('./maneuver-node.js').ManeuverNodeRecord|null|undefined):FiniteBurnPreview|null}
export function mountFiniteBurn(anchor:Element,getFlight:()=>FiniteBurnPanelFlight|null|undefined):FiniteBurnPanel{
 const row=document.createElement('div'),power=document.createElement('select'),timing=document.createElement('select'),button=document.createElement('button'),readout=document.createElement('p');
 row.className='finiteBurnControls';timing.title='計画時刻に噴射を始めるか、噴射の中央を合わせるか選択';power.setAttribute('aria-label','有限噴射の推力');timing.setAttribute('aria-label','有限噴射の開始時刻');
 for(const value of [1,10,100]){const option=document.createElement('option');option.value=String(value/100);option.textContent=value+'%固定';power.append(option);}power.value='0.1';
 for(const [value,text]of [['start','開始基準'],['center','中央基準']]){const option=document.createElement('option');option.value=value;option.textContent=text;timing.append(option);}
 button.textContent='噴射中の軌道を比較';button.title='固定姿勢・一定推力。重力・燃料減少・胴体抗力・気圧を計算。姿勢誤差・熱損傷・段切替は含まない。計画とスロットルは変更しません';
 const returnButton=document.createElement('button');returnButton.textContent='この推力で帰還案';returnButton.title='60秒後に開始し、選択した一定推力と精密0.05m/s停止で近点25 kmを狙う案。有限噴射を計算。中央基準ではなく開始基準へ切替。計画固定・点火・停止支援は別操作';
 readout.setAttribute('role','status');row.append(power,timing,button,returnButton,readout);anchor.after(row);
 let context:FiniteBurnContext|null=null,result:FiniteBurnPreview|null=null,pendingReturn:FiniteBurnPendingReturn|null=null,signature='',computedSignature='';
 const clear=()=>{result=null;readout.textContent='';};power.onchange=timing.onchange=()=>{clear();pendingReturn=null;};
 document.querySelector('#orbitOverlay')!.addEventListener('input',e=>{if(['planEnabled','planLocation','planDeltaV','planNormal','planRadial'].includes((e.target as Element).id)){clear();pendingReturn=null;}});
 button.onclick=()=>{clear();try{
  const f=getFlight();if(!context||!f)throw Error('通常マニューバを作成してください');
  const throttle=Number(power.value),duration=captureBurnEstimate(f,context.impulse.length()).duration/throttle,startTime=context.epoch-(timing.value==='center'?duration/2:0);
  result=finiteBurnPreview(f,context.impulse,startTime,{throttle,tolerance:context.tolerance});computedSignature=signature;
  const km=(n:number)=>Number.isFinite(n)?(n/1000).toFixed(2)+' km':'なし';
  readout.textContent='計算時点 · 近点 '+km(result.orbit.periapsis)+' / 遠点 '+km(result.orbit.apoapsis)+'\n開始まで '+(startTime-f.universalTime).toFixed(1)+'秒 · 噴射 '+result.duration.toFixed(1)+'秒';
  readout.title='緑：有限噴射後。計算UT '+result.computedAt.toFixed(1)+' / 開始UT '+startTime.toFixed(1)+'。'+(result.atmospheric?'大気中の胴体抗力を含みます。':'')+'停止精度 '+context.tolerance+' m/s、姿勢固定の近似。自動点火・計画時刻の変更は行いません';
 }catch(error){readout.textContent=(error as Error).message;}};
 returnButton.onclick=()=>{clear();try{
  const plan=finiteReturnPlan(getFlight()!,{throttle:Number(power.value)}),location=document.querySelector<HTMLInputElement>('#planLocation')!;
  location.value='custom';location.dataset.epoch=String(plan.location.universalTime);location.dataset.tolerance='0.05';
  for(const [id,key]of [['planDeltaV','prograde'],['planNormal','normal'],['planRadial','radial']] as [string,keyof import('./maneuver.js').ManeuverComponents][])(document.getElementById(id) as HTMLInputElement).value=String(plan.components[key]);
  document.querySelector<HTMLInputElement>('#planEnabled')!.checked=true;timing.value='start';location.dispatchEvent(new Event('input',{bubbles:true}));pendingReturn={vesselId:getFlight()!.vesselId,epoch:plan.location.universalTime,impulse:plan.preview.impulse.clone(),throttle:plan.throttle};button.click();
 }catch(error){readout.textContent=(error as Error).message;}};
 return {plannedThrottle(preview){const f=getFlight(),p=pendingReturn;return p&&f?.vesselId===p.vesselId&&Math.abs(preview.universalTime-p.epoch)<1e-6&&preview.impulse.distanceTo(p.impulse)<.001?p.throttle:undefined;},update(preview,node){
  const f=getFlight();context=preview?.impulse?{impulse:preview.impulse,epoch:preview.universalTime,tolerance:.05}:node&&!node.complete&&!node.capture&&!node.returnPlan&&!node.departure?{impulse:new T.Vector3(...node.remaining),epoch:node.universalTime??f!.universalTime+node.time-f!.time,tolerance:node.tolerance??.5}:null;
  signature=JSON.stringify([f?.vesselId,f?.parts.map(p=>[p.id,p.thrustLimit,p.fuelEnabled,p.fuelCrossfeed]),f?[...f.fuel]:null,f?.stats.mass,f?.stage,context?.epoch,context?.impulse.toArray().map(x=>x.toFixed(3)),context?.tolerance]);
  if(result&&(signature!==computedSignature||f!.throttle>0||f!.universalTime>=result.startTime))clear();
  returnButton.disabled=!f||f.throttle!==0;
  button.disabled=!context||!f||f.throttle!==0||context.epoch<f.universalTime;
  return result;
 }};
}

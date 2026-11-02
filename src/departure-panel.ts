import {mountManeuverStop,type StopFlight} from './maneuver-stop.js';
import {maneuverBurnAvailable,type ManeuverBurnVessel} from './maneuver-controls.js';
import * as T from 'three';
import {element} from './dom.js';
import {lunarDeparturePlan,lunarDepartureNode,type LunarDepartureVessel} from './lunar-departure.js';
import {canControl} from './fleet.js';
import {formatDuration} from './orbit-plan.js';

/** The flight fields the lunar departure panel reads and sets. */
export interface DeparturePanelFlight extends StopFlight,ManeuverBurnVessel,LunarDepartureVessel{parts:LunarDepartureVessel['parts'];stats:LunarDepartureVessel['stats'];networks:Pick<import('./resources.js').FuelNetworks,'network'|'groups'>;sas:boolean;sasMode:string;orbit:{bodyId:string;stable?:boolean};transferGuide?:unknown}
export interface DeparturePanel{update():void}
export function mountDeparturePanel(host:Element,getFlight:()=>DeparturePanelFlight|null|undefined,changed:(message?:string)=>void):DeparturePanel{
 const panel=document.createElement('details');panel.id='departurePanel';panel.hidden=true;
 panel.innerHTML='<summary>現在の軌道から月へ</summary><p class="departureStatus" role="status"></p><p class="departureNumbers"></p><button class="departurePlan">月遷移を計画・SAS整列</button><div><button class="departureFull">月遷移噴射100%</button><button class="departureFine">月遷移微調整10%</button><button class="departurePrecise">月遷移微調整1%</button><button class="departureStop">月遷移噴射を停止</button></div><details class="flightHelp"><summary>月往復の手順</summary><small>Luna Expeditionは発射台から開始。自動軌道投入の実演または手動操作で周回へ。点火済みの上段を停止して計画します。落下中の分離段がある間は高速航行できません。</small><small>開始60秒前に通常速度へ戻ります。SAS予定噴射で方向差を小さくし、開始時刻に100%。残り10 m/sで10%、2 m/sで1%、到達表示で停止。有限予測もこの操作が前提です。月重力圏へ入ったら「月周回計画を固定・SAS整列」を使い、周回後は帰還計画の15 kmを選択。母星接近後にSpaceで推進部を分離、SAS逆行、SpaceまたはHでパラシュート待機。</small><small>探索は現在軌道の2周分に限定します。候補が見つからない場合や燃料不足の場合は軌道・機体設計を見直してください。計画は自動噴射ではありません。</small></details>';
 host.before(panel);const stopAssist=mountManeuverStop(panel,getFlight,'departure');let message='',vessel:DeparturePanelFlight|null|undefined=null;
 element(panel,'.departurePlan','button').onclick=()=>{const f=getFlight();if(!f||!canControl(f))return;try{const plan=lunarDeparturePlan(f);f.maneuver=lunarDepartureNode(plan,f);f.sas=true;f.sasMode='maneuver';message='';changed('月遷移計画を固定しました。噴射と停止は手動です。');}catch(e){message=e instanceof Error?e.message:String(e);}update();};
 for(const [name,throttle]of [['Full',1],['Fine',.1],['Precise',.01],['Stop',0]] as const)element(panel,'.departure'+name,'button').onclick=()=>{const f=getFlight();if(f?.maneuver?.departure&&canControl(f)&&(throttle===0||maneuverBurnAvailable(f,'departure'))){f.throttle=throttle;changed();update();}};
 function update(){stopAssist.update();const f=getFlight(),node=f?.maneuver,meta=node?.departure;panel.hidden=!f||(!meta&&(f.orbit?.bodyId!=='planet'||!f.orbit?.stable||!!f.transferGuide));if(panel.hidden||!f)return;
  if(vessel!==f){vessel=f;message='';panel.open=!!meta;}
  element(panel,'.departurePlan','button').disabled=!canControl(f)||!!meta;
  for(const name of ['Full','Fine','Precise','Stop'])element(panel,'.departure'+name,'button').disabled=name==='Stop'?(!canControl(f)||!meta):!maneuverBurnAvailable(f,'departure');
  const status=element(panel,'.departureStatus','p'),numbers=element(panel,'.departureNumbers','p');
  if(!meta||!node){status.textContent=message||'母星の周回軌道・点火済み段・推力0から計画します。';numbers.textContent='';return;}
  const left=new T.Vector3(...node.remaining).length(),until=node.universalTime-f.universalTime,angle=new T.Vector3(0,1,0).applyQuaternion(f.q).angleTo(new T.Vector3(...(node.complete?node.impulse:node.remaining)))*180/Math.PI;
  status.textContent=node.complete?(f.throttle>0?'目標Δv到達：今すぐ噴射停止':f.orbit.bodyId==='moon'?'月重力圏へ到達。月周回の減速計画へ進んでください':'噴射終了。軌道予測で月接近を確認してください'):until>0?'月遷移噴射開始まで '+formatDuration(until):f.throttle>0?'残り10 m/sで10%、2 m/sで1%、到達表示で停止':'噴射開始時刻です（'+formatDuration(-until)+'経過）';
  numbers.textContent=`${node.complete?'目標との差':'残り'} ${left.toFixed(2)} / ${meta.deltaV.toFixed(1)} m/s · 方向差 ${angle.toFixed(1)}° · 現在 ${(100*f.throttle).toFixed(1)}%。全開換算 ${meta.duration.toFixed(1)}秒。有限噴射予測の月近点 ${(meta.periapsis/1000).toFixed(1)} km。`;
 }
 return {update};
}

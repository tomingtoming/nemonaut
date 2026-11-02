import {mountManeuverStop,type StopFlight} from './maneuver-stop.js';
import {maneuverBurnAvailable,type ManeuverBurnVessel} from './maneuver-controls.js';
import {canControl} from './fleet.js';
import * as T from 'three';
import {lunarCapturePlan,captureNode,type LunarCaptureVessel} from './lunar-capture.js';
import {MOON} from './celestial.js';
import {formatDuration} from './orbit-plan.js';

/** The flight fields the lunar capture panel reads and sets. */
export interface CapturePanelFlight extends StopFlight,ManeuverBurnVessel,LunarCaptureVessel{parts:LunarCaptureVessel['parts'];stats:LunarCaptureVessel['stats'];sas:boolean;sasMode:string;orbit?:{bodyId:string;energy:number;periapsis:number;apoapsis:number}|null}
export interface CapturePanel{update():void}
export function mountCapturePanel(host:Element,getFlight:()=>CapturePanelFlight|null|undefined,notify:(message:string)=>void):CapturePanel{
 const panel=document.createElement('section');panel.className='transferPanel';panel.id='capturePanel';panel.hidden=true;
 panel.innerHTML='<strong>月周回・手動投入ガイド</strong><p class="captureStatus" role="status"></p><p class="captureNumbers"></p><button class="capturePlan">月周回計画を固定・SAS整列</button><div><button class="captureFull">全開で噴射</button><button class="captureFine">10%で微調整</button><button class="captureStop">噴射停止 X</button></div><small>開始60秒前に高速航行を解除。SAS「予定噴射」で方向差を確認し、開始時刻に手動で全開。残り30 m/sで10%へ絞り、目標到達で停止。近点での瞬間噴射を基にした案のため、実際の遠近点で周回を確認してください。点火・推力調整は手動です。停止支援は下のチェックで選択できます。</small>';
 host.after(panel);const stopAssist=mountManeuverStop(panel,getFlight,'capture');
 const status=panel.querySelector<HTMLElement>('.captureStatus')!,numbers=panel.querySelector<HTMLElement>('.captureNumbers')!,planButton=panel.querySelector<HTMLButtonElement>('.capturePlan')!;let message='',vessel:CapturePanelFlight|null|undefined=null;
 planButton.onclick=()=>{const f=getFlight();if(!f||!canControl(f))return;try{const plan=lunarCapturePlan(f);f.maneuver=captureNode(plan,f);f.sas=true;f.sasMode='maneuver';message='';notify('月周回計画を固定しました。60秒の整列後、点火・停止は手動です。');}catch(e){message=(e as Error).message;}update();};
 for(const [name,throttle]of [['Full',1],['Fine',.1],['Stop',0]] as [string,number][])panel.querySelector<HTMLElement>('.capture'+name)!.onclick=()=>{const f=getFlight();if(f&&canControl(f)&&f.maneuver?.capture&&(throttle===0||maneuverBurnAvailable(f,'capture')))f.throttle=throttle;update();};
 function update(){stopAssist.update();
  const f=getFlight(),node=f?.maneuver,meta=node?.capture;panel.hidden=!f||(!meta&&(f.orbit?.bodyId!=='moon'||(f.orbit.energy<0&&(f.orbit.periapsis<1000||f.orbit.apoapsis+MOON.radius<MOON.sphereOfInfluence))));if(panel.hidden)return;
  if(vessel!==f){vessel=f;message='';}
  const o=f!.orbit,closed=o?.bodyId==='moon'&&o.energy<0&&o.periapsis>1000&&o.apoapsis+MOON.radius<MOON.sphereOfInfluence;
  planButton.disabled=!!meta||!canControl(f!);
  for(const name of ['Full','Fine','Stop'])panel.querySelector<HTMLButtonElement>('.capture'+name)!.disabled=name==='Stop'?(!meta||!canControl(f!)):!maneuverBurnAvailable(f,'capture');
  if(!meta){status.textContent=message|| (closed?'月周回軌道です':'接近中に計画を固定してください。点火済み段・スロットル0が必要です。');numbers.textContent='';return;}
  const left=new T.Vector3(...node!.remaining).length(),until=node!.universalTime-f!.universalTime,angle=new T.Vector3(0,1,0).applyQuaternion(f!.q).angleTo(new T.Vector3(...node!.impulse))*180/Math.PI;
  status.textContent=node!.complete?(f!.throttle>0?'目標Δv到達：今すぐ噴射停止':closed?'月周回成立。母星へ戻る場合は帰還計画を開いてください':'噴射終了。実際の遠近点で確認してください'):until>0?'噴射開始まで '+formatDuration(until):f!.throttle>0?(left<30?'10%で調整し、目標到達で停止':'噴射中：残りΔvを確認'):'開始時刻です（'+formatDuration(-until)+'経過）';
  numbers.textContent=`${node!.complete?'目標との差':'残り'} ${left.toFixed(1)} / ${meta.deltaV.toFixed(1)} m/s · 方向差 ${angle.toFixed(1)}° · 全開目安 ${meta.duration.toFixed(1)}秒。近点通過 UT ${meta.midTime.toFixed(1)} s。`+(closed?` 月周回成立：近点 ${(o.periapsis/1000).toFixed(1)} / 遠点 ${(o.apoapsis/1000).toFixed(1)} km。`:' 月周回はまだ成立していません。');
 }
 return {update};
}

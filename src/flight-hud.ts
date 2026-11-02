// Flight HUD (BACKLOG 7c, moved from app.ts unchanged): the coast blocker notice with its inspect button and
// the guard that drops fast physics when a flight control is used, the list of separated vessels with tracking,
// control and targeting, the navigation readout with the navball, and the lunar transfer guide. app.ts calls
// mountWarpGuard and wireFlightHud at their original places (each handler of wireFlightHud is the only one of
// its element and event). Calls up into app.ts through app-hooks. No import-time side effects.
import * as T from 'three';
import {updateSasDirections} from './ksp-layout.js';
import {frameTrackedVessel} from './camera-up.js';
import {setTarget,resolveTargets,relativeState} from './relative-navigation.js';
import {powerTotals} from './power.js';
import {canControl} from './fleet.js';
import {drawNavball} from './navigation.js';
import {bodyUp} from './celestial.js';
import {state} from './app-state.js';
import {hooks} from './app-hooks.js';
import {$} from './ui-common.js';
import {currentFlight,vesselCenter,flightCenter} from './current-flight.js';
import {sceneCore,flightFocus,frame} from './scene.js';
import {openTracking} from './tracking-recovery.js';
import {updateDocking} from './docking-ui.js';
import {physicsClock} from './flight-shared.js';
import {allDebris} from './flight-visuals.js';
let inspect:HTMLButtonElement|null=null;
function inspectButton():HTMLButtonElement{if(!inspect)throw Error('停止原因の確認ボタンがまだ作られていません');return inspect;}
/** The inspect button after the warp status and the guard that returns to normal speed when a flight control is used. */
export function mountWarpGuard(){
const warpInspect=document.createElement('button');warpInspect.textContent='停止の原因となった機体を確認';warpInspect.hidden=true;$('#warpStatus','small').after(warpInspect);inspect=warpInspect;
warpInspect.onclick=()=>{const id=state.lastCoastBlocker?.vesselId;if(!id)return;hooks.showCenter();openTracking(id);};
// Pointer and keyboard activation of flight controls must not leave fast physics
// running while the pilot changes thrust, staging or attitude commands.
for(const type of ['click','input','change'])document.addEventListener(type,event=>{
 const target=event.target,control=target instanceof Element?target.closest('button,input,select'):null;
 if(!control||control.id==='warp'||!state.flight||!control.closest('#flightHud,#inspector,#orbitOverlay'))return;
 if(Number($('#warp','select').value)>1){$('#warp','select').value='1';physicsClock.reset();$('#warpStatus','small').textContent='通常速度へ：画面から操縦操作';}
},true);
}
export function showCoastBlocker(blocked:import('./coast-flight.js').CoastBlocker|null){state.lastCoastBlocker=blocked;inspectButton().hidden=!blocked?.vesselId;return blocked?blocked.vesselName+'：'+(blocked.overdue?'予定噴射の時刻を過ぎています。再計画または計画削除を確認':blocked.reason)+(blocked.otherVesselName?' · 相手機 '+blocked.otherVesselName:''):'';}
export function updateDebrisList(){const controlled=currentFlight(),notice=$('#trackingFocus','div');notice.hidden=!state.trackedDebris;if(state.trackedDebris){$('#trackingName','span').textContent='追跡：'+(state.trackedDebris.vesselName||'分離機');$('#trackingName','span').title=state.trackedDebris.vesselName||'分離機';$('#trackingControl','small').textContent='操作・計器：'+(controlled.vesselName||'操縦機');$('#trackingControl','small').title=controlled.vesselName||'操縦機';}const children=allDebris(controlled),list=$('#debrisList','div');list.replaceChildren();$('#debrisCount','b').textContent=String(children.length);for(const [index,f]of children.entries()){const row=document.createElement('div'),text=document.createElement('small'),button=document.createElement('button');text.textContent=(f.vesselName||'機体 '+(index+1))+' · '+f.parts.length+'部品 · '+((f.orbit?.altitude||0)/1000).toFixed(1)+' km · 軌道 '+(f.orbit?.speed??0).toFixed(0)+' m/s · 燃料 '+Math.round(f.fuelRatio*100)+'% · 電力 '+powerTotals(f.parts,f.charge).stored.toFixed(0)+' EC'+(f.crashed?' · 損傷':f.landed?' · 着地':'');button.textContent=state.trackedDebris===f?'追跡中':'追跡';button.onclick=()=>{state.trackedDebris=f;const target=vesselCenter(f);frameTrackedVessel(sceneCore().controls,target,bodyUp(target,currentFlight().universalTime));flightFocus.copy(target);updateDebrisList();};const take=document.createElement('button');take.textContent=canControl(f)?'操縦':'制御不可';take.disabled=!canControl(f);take.onclick=()=>hooks.switchVessel(f);const targetButton=document.createElement('button');targetButton.textContent=controlled.navigationTarget===f?'目標指定中':'目標にする';targetButton.onclick=()=>{const live=currentFlight();setTarget(live,live,f);updateNavigation();updateDebrisList();};row.append(text,button,take,targetButton);list.append(row);}}
export function wireFlightHud(){
$('#trackPrimary','button').onclick=$('#returnCamera','button').onclick=()=>{state.trackedDebris=null;$('#trackingFocus','div').hidden=true;frame();};
$('#clearTarget','button').onclick=()=>{if(state.flight){setTarget(state.flight,state.flight,null);updateNavigation();updateDebrisList();}};
$('#warp','select').addEventListener('change',()=>{physicsClock.reset();showCoastBlocker(null);$('#warpStatus','small').textContent=Number($('#warp','select').value)===1?'通常速度 · 1倍':'';});
}
export function updateNavigation(){resolveTargets(currentFlight());updateDocking();const fl=currentFlight(),relative=relativeState(fl,fl.navigationTarget);$('#targetInfo','b').textContent=relative?'目標まで '+relative.distance.toFixed(1)+' m · 相対速度 '+relative.speed.toFixed(2)+' m/s':'目標未指定';$('#targetDetail','small').textContent=relative?(relative.closing>=0?'接近 ':'離脱 ')+Math.abs(relative.closing).toFixed(2)+' m/s · '+(relative.braking?'減速方向まで '+(Math.acos(T.MathUtils.clamp(new T.Vector3(0,fl.rocketAxes?1:0,fl.rocketAxes?0:1).applyQuaternion(fl.q).dot(relative.braking),-1,1))*180/Math.PI).toFixed(0)+'° · 整列後 I でRCS噴射':'速度差 0.01 m/s以下 · 噴射を停止'):'';if(relative&&fl.portTranslationEnabled)$('#targetDetail','small').textContent='ポート基準の並進中 · 右のポート誘導で接近';$('#translationHelp','span').textContent=fl.portTranslationEnabled?'RCS並進: I/K 接近・離脱 · J/L 左右 · U/O 上下（目標ポート基準）':'RCS並進: I/K 前後 · J/L 左右 · U/O 上下（機体軸）';$('#clearTarget','button').hidden=!relative;const nav=drawNavball($('#navball','canvas'),fl.q,fl.rocketAxes,flightCenter(),fl.vel,fl.universalTime,fl.navigationFrame);$('#navPitch','small').textContent='HDG '+(nav.heading===null?'—':String(Math.round(nav.heading)%360).padStart(3,'0')+'°')+' · PITCH '+nav.pitch.toFixed(0)+'°';$('#sasMode','select').value=fl.sasMode;updateSasDirections(fl);}
export function updateTransferGuide(){const guided=state.flight,g=guided?.transferGuide,panel=$('#transferPanel','section');panel.hidden=!g;if(!g||!guided)return;const until=g.startTime-guided.universalTime,remaining=g.target-g.delivered,early=g.firstBurnTime!==null?g.firstBurnTime-g.startTime:null;
 $('#transferStatus','p').textContent=g.firstBurnTime===null?(until>0?'噴射開始まで '+until.toFixed(1)+'秒 · SAS順行・スロットル0で待機':'噴射時刻です（'+(-until).toFixed(1)+'秒経過）'):remaining<=0?(guided.throttle>0?'目標Δv到達 — 今すぐ噴射停止':'噴射完了。軌道マップで接近予測を再計算してください'):(remaining<100?'10%へ絞って調整 · 残り ':'噴射中 · 残り ')+remaining.toFixed(1)+' m/s';
 $('#transferProgress','p').textContent='順行噴射量 '+g.delivered.toFixed(1)+' / '+g.target.toFixed(1)+' m/s · 全開の目安 '+g.burnTime.toFixed(1)+'秒'+(early!==null&&Math.abs(early)>2?' · 開始ずれ '+early.toFixed(1)+'秒：到達は再予測が必要':'');
 $('#transferIgnite','button').disabled=!canControl(guided)||guided.crashed;
}

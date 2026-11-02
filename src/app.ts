import './storage-migration.js';
import {storageKey} from './app-id.js';
import {mountFailureLog,failureHistory} from './failure-feedback.js';
import {failureCaption} from './failure-events.js';
import {FailureVisuals,markWreckVisual} from './failure-visuals.js';
import './orbital-ascent-panel.js'; // keeps the module evaluation order (mounted in flight-panels)
import {syncCargoVisual} from './cargo-geometry.js';
import {acceptsFlightKey} from './flight-keyboard.js';
import './runway-panel.js'; // keeps the module evaluation order (mounted in flight-panels)
import {syncEngineShrouds} from './engine-shrouds.js';
import './docking-window.js'; // keeps the module evaluation order (mounted in flight-panels)
import './delivery-panel.js'; // keeps the module evaluation order (mounted in flight-panels)
import {updateEnginePlume} from './engine-plume.js';
import {chuteNames} from './recovery.js';
import './overlay-panels.js'; // import-time DOM setup (panel dock); keeps its original evaluation order
import {FlightScenery,surfaceMaterial} from './flight-scenery.js';
import {frameTrackedVessel,constrainSurfaceCamera,orbitByArrows} from './camera-up.js';
import {PracticeSession} from './practice-session.js';
import {departureMode,historyActionLabel,updateDepartureButton} from './departure-mode.js';
import {launchSiteOrientation,surfaceOrientation,surfaceRelativeVelocity} from './surface-frame.js';
import {needsPhysicsMigration,physicsMigrationMessage} from './physics-migration.js';
import {mountThrustOverlay} from './thrust-overlay.js';
import {physicalWarpStop} from './physics-clock.js';
import {formatUniversalTime} from './universal-time.js';
import {workshopLayout,workshopFrame} from './workshop-layout.js';
import {mountTrackingMap,TRACKING_COLORS} from './tracking-map.js';
import {DESIGN_LIBRARY_KEY,readDesignLibrary,appendDesign,designForLaunch} from './design-library.js';
import {launchWorld,worldTrackingList} from './world-operations.js';
import {fleet} from './fleet.js';
import {CENTER_FACILITIES,centerGuidance} from './center-facilities.js';
import {SpaceCenter} from './space-center.js';
import {gameRecord} from './game-save.js';
import {worldFromFlight,flightFromWorld,type SavedWorld} from './world-save.js';
import {readStoredGame,writeStoredGame,backupStoredGame} from './game-storage.js';
import {canControl} from './fleet.js';
import * as T from 'three';
import {PARTS,nodes,nodePoint,nodeAxis,preset} from './catalog.js';
import {validateCraft,Flight,type FlightPart} from './core.js';
import {SAS_MODES,navigationVelocity} from './navigation.js';
import {saveFlight,loadFlight} from './flight-save.js';
import {ReturnPilot} from './return-pilot.js';
import {LaunchPilot} from './launch-pilot.js';
import {PLANET,center} from './planet.js';
import {bodyState,bodyUp,referenceBody} from './celestial.js';
import {loadPhysics} from './physics.js';
import {installTranslation,currentLanguage,setLanguage} from './i18n.js';
import {isFirstVisit,renderFirstSteps} from './first-steps.js';
import {closest} from './dom.js';
import {state as S,type EditMode} from './app-state.js';
import {wireHooks} from './app-hooks.js';
import {$,$$,errorMessage,notify,showModal} from './ui-common.js';
import {currentFlight,currentWorldRuntime,vesselCenter,flightCenter} from './current-flight.js';
import {createRenderer,createView,createEditorMarkers,createSelectionOverlays,objects,flightFocus,setCameraUp,resize,frame} from './scene.js';
import {buildWorkshopBay,updateWorkshop} from './workshop-bay.js';
import {assets,loadAssets} from './asset-loader.js';
import {updateRCSVisual,rebuildCraft} from './part-visuals.js';
import {updateWorldGeometry,planetMaterial,patchMaterial} from './flight-world.js';
import {updateFlightChallenges,updateExploration} from './exploration-ui.js';
import {openTracking} from './tracking-recovery.js';
import {loadDesigns,saveDesign,openLaunchLibrary} from './design-library-ui.js';
import {checkpoint,undo,redo} from './workshop-undo.js';
import {createWorkshopOverlays,renderInterferences} from './workshop-panels.js';
import {cancelPlacement,pointer,hitPart,updatePlacementCopies,wirePlacement} from './workshop-place.js';
import {select,setMode,deleteSelected,wireSelection} from './workshop-select.js';
import {loadData,setBay,applySnap,workshopSymmetry,wireWorkshopToolbar,catalog,wireCatalog} from './workshop-toolbar.js';
import {dockingPilot,initDockingUi,wireDockingPorts,updateDocking} from './docking-ui.js';
import {updateOrbit,mountOrbitMapPanels,toggleOrbitMap,wireOrbitMapControls} from './orbit-map-ui.js';
import {keys,physicsClock,mountFlightAudio} from './flight-shared.js';
import {mountPartWindowPanels,mountFlightPanels} from './flight-panels.js';
import {updateInfo} from './info-hub.js';
import {parachuteVisuals,exhaust,allDebris,updateDebrisVisuals,controlName} from './flight-visuals.js';
import {mountWarpGuard,showCoastBlocker,updateDebrisList,wireFlightHud,updateNavigation} from './flight-hud.js';
import {startFlight,syncFlightControls,switchVessel,endFlight,stage,refreshDockedFlight} from './flight-lifecycle.js';
import {wireFlightControls} from './flight-controls-ui.js';
wireHooks({updateInfo,syncFlightControls,switchVessel,startFlight,endFlight,stage,refreshDockedFlight,updateDocking,updateNavigation,updateDebrisList,updateExploration,showCenter,refreshCenter,enterWorkshop,resumeFromCenter,openTracking,persistWorkspace,launchAdditional,rebuild,select,cancelPlacement,checkpoint,setBay,loadData,frame,updateWorkshop,renderInterferences});
// English display rewrites text through dist/i18n/en.json; Japanese changes nothing.
await installTranslation();
for(const id of ['language','centerLanguage']){const b=document.getElementById(id);if(!b)continue;const english=currentLanguage()==='en';b.textContent=english?'JA':'EN';b.title=english?'日本語で表示':'Show in English';b.onclick=()=>setLanguage(english?'ja':'en');}
// Physics runs on the Rust Wasm engine only. If it cannot load, stop with a visible error
// instead of falling back to the retired JS solver.
try{await loadPhysics();document.documentElement.dataset.physics='rust';}
catch(error){const notice=document.createElement('div');notice.setAttribute('role','alert');notice.style.cssText='position:fixed;inset:auto 8px 8px 8px;z-index:1000;padding:8px 12px;border-radius:4px;font:14px system-ui;background:#5a1e1e;color:#fff';notice.textContent='物理エンジン（Rust Wasm）を読み込めません: '+errorMessage(error);document.body.append(notice);throw error;}
addEventListener('error',e=>{if(String(e.message).includes('Rust物理')){const notice=document.createElement('div');notice.setAttribute('role','alert');notice.style.cssText='position:fixed;inset:auto 8px 8px 8px;z-index:1000;padding:8px 12px;border-radius:4px;font:14px system-ui;background:#5a1e1e;color:#fff';notice.textContent=e.message;document.body.append(notice);}});
mountWarpGuard();
const canvas=$('#scene','canvas'), viewport=$('#viewport','section');
const {renderer,scene}=createRenderer(canvas);const failureVisuals=new FailureVisuals(scene);const announcedFailures=new Set();
const {camera,controls,ambient,sun,bay,craftRoot,markers}=createView(viewport);const thrustOverlay=mountThrustOverlay(scene);
buildWorkshopBay();
const {gizmo}=createEditorMarkers();
S.parts=preset('rocket');
createWorkshopOverlays();
function rebuild(){rebuildCraft();if(S.selected&&!objects.has(S.selected))S.selected=null;select(S.selected);updateInfo();renderInterferences();updateWorkshop();}
const {highlight,placementCopies,partHover}=createSelectionOverlays();
wireSelection();
wirePlacement();
const {partWindows,designPartWindows}=mountPartWindowPanels();
canvas.addEventListener('pointerup',e=>{if(S.atCenter||e.button!==2||!S.pointerDown||S.placing||S.movingBranch||S.pointerDown.wasGizmo||gizmo.dragging||Math.hypot(e.clientX-S.pointerDown.x,e.clientY-S.pointerDown.y)>5)return;pointer(e);const hit=hitPart();if(hit)(S.flight?partWindows:designPartWindows).open(hit.id,e.clientX,e.clientY);});
wireFlightHud();
$('.close','button').onclick=()=>$('#modal','dialog').close();$('#modal','dialog').addEventListener('click',e=>{if(e.target===$('#modal','dialog'))$('#modal','dialog').close();});
wireWorkshopToolbar();
mountOrbitMapPanels(()=>{maneuverPanel.stop();orbitalPanel.stop();});
wireOrbitMapControls();

wireFlightControls();
const flightSaveKey=storageKey('flight-v1');
function quickSave(){if(!S.flight)return;try{updateExploration();if(S.practiceSession){S.practiceSession.saveFlight(flightRecord());notify('練習中の飛行を一時保存しました。練習終了・再読込で破棄されます。');return;}const pilot=S.launchPilot?{kind:S.launchPilot instanceof ReturnPilot?'return':'launch',done:S.launchPilot.done,released:!!S.launchPilot.released}:null;localStorage.setItem(flightSaveKey,JSON.stringify(saveFlight(S.flight,{blueprint:S.parts.length?S.parts:S.flight.parts,name:S.flight.vesselName||S.activeFlightName||$('#craftName','input').value,pilot,worldHistory:S.parkedWorld?.history??[]})));notify('飛行を保存しました · T+ '+S.flight.time.toFixed(1)+'s');}catch(e){notify('飛行を保存できませんでした：'+errorMessage(e));}}
function quickLoad(){try{if(S.practiceSession){restoreFlight(S.practiceSession.loadFlight());return;}const raw=localStorage.getItem(flightSaveKey);if(!raw)throw Error('保存された飛行がありません');if(raw.length>2000000)throw Error('保存データが大きすぎます');const data=JSON.parse(raw);if(needsPhysicsMigration(data))localStorage.setItem(flightSaveKey+'-before-rotation-'+Date.now(),raw);restoreFlight(data);}catch(e){notify(errorMessage(e));}}
function isPartList(value:unknown):value is FlightPart[]{return Array.isArray(value);}
function isSavedPilot(value:unknown):value is {kind:'return'|'launch';done:boolean;released:boolean}{return typeof value==='object'&&value!==null&&'kind' in value&&(value.kind==='return'||value.kind==='launch')&&'done' in value&&typeof value.done==='boolean'&&'released' in value&&typeof value.released==='boolean';}
function restoreFlight(data:import('./flight-save.js').SavedFlight){const draft={parts:S.parts,name:$('#craftName','input').value,environment:$('#environment','select').value,bay:S.bayMode};let restored;try{const blueprint=data.meta?.blueprint;validateCraft({version:1,parts:isPartList(blueprint)?blueprint:blueprint?[]:data.parts});const rawPilot=data.meta?.pilot,pilot=isSavedPilot(rawPilot)?rawPilot:undefined;if(rawPilot&&!pilot)throw Error('自動実演の保存形式が不正です');const restoredWorld=worldFromFlight(data);restored=loadFlight(data);if(S.flight)endFlight();S.parkedWorld=restoredWorld;S.parts=structuredClone(restored.parts);$('#craftName','input').value=typeof data.meta?.name==='string'?data.meta.name.slice(0,80):'Restored flight';$('#environment','select').value=restored.environment;rebuild();startFlight(restored);const restoredFlight=currentFlight();S.activeFlightName=restoredFlight.vesselName||$('#craftName','input').value;S.parts=draft.parts;$('#craftName','input').value=draft.name;$('#environment','select').value=draft.environment;S.bayMode=draft.bay;for(const k of ['reactionEnabled','steeringEnabled','driveEnabled','rcsEnabled'] as const)$('#'+k,'input').checked=restoredFlight[k];$('#throttle','input').value=String(restoredFlight.throttle*100);$('#ballast','input').value=String(restoredFlight.ballast*100);$('#trim','input').value=String(restoredFlight.trim*100);$('#trimVal','b').textContent=Math.round(restoredFlight.trim*100)+'%';$('#sas','button').textContent='SAS '+(restoredFlight.sas?'ON':'OFF');$('#sas','button').classList.toggle('active',restoredFlight.sas);$('#brake','button').textContent='BRAKE '+(restoredFlight.brake?'ON':'OFF');$('#brake','button').classList.toggle('active',restoredFlight.brake);if(pilot){S.launchPilot=pilot.kind==='return'?new ReturnPilot():new LaunchPilot();S.launchPilot.done=pilot.done;S.launchPilot.released=pilot.released;$('#autoLaunch','button').textContent='自動実演を解除';}if(restoredFlight.physicsMigration)$('#centerNotice','p').textContent=physicsMigrationMessage(restoredFlight.physicsMigration);flightPause.set(true);notify(physicsMigrationMessage(restoredFlight.physicsMigration)||('飛行を復元しました · 一時停止 · T+ '+restoredFlight.time.toFixed(1)+'s'));return true;}catch(e){if(restored&&restored!==S.flight)restored.dispose();notify(errorMessage(e));return false;}}
$('#quickSave','button').onclick=quickSave;$('#quickLoad','button').onclick=quickLoad;$('#resumeFlight','button').onclick=quickLoad;
$('#launch','button').onclick=requestLaunch;$('#back','button').onclick=()=>{const damaged=S.launchPartOrigins.get(S.flight?.failureEvents?.at(-1)?.partId);if(S.practiceSession)finishPractice();else {parkFlight();endFlight();}if(damaged&&S.parts.some(p=>p.id===damaged))select(damaged);persistWorkspace();};
window.addEventListener('keydown',e=>{if(S.atCenter)return;if(S.flight&&['F5','F9'].includes(e.code)){e.preventDefault();if(!e.repeat)(e.code==='F5'?quickSave:quickLoad)();return;}if((S.flight?!acceptsFlightKey(e.target,e.code):e.target instanceof Element&&['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))||$('#modal','dialog').open)return;if(S.flight&&e.code==='KeyF'){e.preventDefault();if(!e.repeat)frame();return;}if(S.flight&&e.code==='KeyP'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();if(!e.repeat)flightPause.toggle();return;}if(S.flight&&e.code==='KeyM'){if(!e.repeat)toggleOrbitMap();return;}if(e.code==='Escape'&&!$('#orbitOverlay','section').hidden){$('#orbitOverlay','section').hidden=true;return;}if(S.flight&&e.code==='CapsLock'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();if(!e.repeat)$('#precisionControl','button').click();return;}if(S.flight&&flightPause.paused)return;if(S.flight&&(!canControl(S.flight)||((e.ctrlKey||e.metaKey||e.altKey)&&!['ControlLeft','ControlRight'].includes(e.code))))return;keys.add(e.code);if(['Space','Delete','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();if(e.repeat)return;if(S.flight){if(e.code==='KeyR')$('#rcsEnabled','input').click();if(e.code==='KeyH')S.flight.armParachutes();if(e.code==='Space')stage();if(e.code==='KeyB')$('#brake','button').click();if(e.code==='KeyT')$('#sas','button').click();if(e.code==='KeyX'||e.code==='KeyZ'){S.launchPilot=null;$('#autoLaunch','button').textContent='自動軌道投入（見本用）';S.flight.throttle=e.code==='KeyZ'?1:0;syncFlightControls();}return;}if(e.ctrlKey&&e.code==='KeyZ'){e.preventDefault();undo();}else if(e.ctrlKey&&e.code==='KeyY'){e.preventDefault();redo();}else if(e.code==='Escape'){cancelPlacement();setMode('select');}else if(e.code==='KeyG')setMode('translate');else if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.code==='KeyR')workshopSymmetry().toggle();else if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.code==='KeyX')workshopSymmetry().cycle(e.shiftKey);else if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.code==='KeyC'){$('#snap','input').checked=!$('#snap','input').checked;applySnap();}else if(e.code==='KeyE')setMode('rotate');else if(e.code==='KeyF')frame();else if(e.code==='Delete')deleteSelected();});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
// Arrow keys orbit the camera in the workshop and in flight, also for wrecks and while paused.
// The space center keeps arrows for facility selection; form fields and sliders keep theirs.
const cameraKeys=new Set();
initDockingUi({keys,gameAudio:()=>gameAudio,dockingWindow:()=>dockingWindow});
window.addEventListener('keydown',e=>{if(S.atCenter||!e.code.startsWith('Arrow')||e.ctrlKey||e.metaKey||e.altKey||$('#modal','dialog').open||!acceptsFlightKey(e.target,e.code))return;e.preventDefault();cameraKeys.add(e.code);});
window.addEventListener('keyup',e=>cameraKeys.delete(e.code));window.addEventListener('blur',()=>cameraKeys.clear());
new ResizeObserver(resize).observe(viewport);
const failureLog=mountFailureLog(closest($('#flightStatus','span'),'.hudtop','div'));
S.last=performance.now();function animate(now:number){requestAnimationFrame(animate);gameAudio.update(S.flight,S.atCenter,flightPause.paused);failureVisuals.update(S.atCenter?null:S.flight);if(S.flight&&!S.atCenter)for(const v of [S.flight,...allDebris(S.flight)])for(const e of v.failureEvents??[]){if(announcedFailures.has(e.id))continue;announcedFailures.add(e.id);if(announcedFailures.size>128)announcedFailures.delete(announcedFailures.values().next().value);if(S.flight.universalTime-e.time<.5)notify(failureCaption(e));}if(S.atCenter){S.last=now;S.centerView?.render();return;}const dt=Math.max(0,Math.min((now-S.last)/1000,.1));S.last=now;if(S.flight){if(!flightPause.paused){if(keys.has('ShiftLeft')||keys.has('ShiftRight'))S.flight.throttle=Math.min(1,S.flight.throttle+dt*.35);if(keys.has('ControlLeft')||keys.has('ControlRight'))S.flight.throttle=Math.max(0,S.flight.throttle-dt*.35);$('#throttle','input').value=String(S.flight.throttle*100);const transferWindow=S.flight.transferGuide&&S.flight.transferGuide.firstBurnTime===null&&S.flight.transferGuide.startTime-S.flight.universalTime<15;const captureWindow=(S.flight.maneuver?.capture||S.flight.maneuver?.returnPlan||S.flight.maneuver?.departure)&&!S.flight.maneuver.complete&&S.flight.maneuver.universalTime-S.flight.universalTime<60;const maneuverWarp=maneuverPanel.warpBudget(S.flight),warpAllowed=!dockingPilot.active&&maneuverWarp>0&&!orbitalPanel.active&&!cruisePanel.active&&!captureWindow&&!transferWindow&&(S.flight.orbit?.altitude||0)>Math.max(1000,S.flight.orbit?.body.atmosphereTop??70000)&&S.flight.throttle===0&&!keys.size&&!S.flight.crashed;const physicalSelected=[2,4].includes(Number($('#warp','select').value)),physicalStop=physicalWarpStop(S.flight,keys.size>0);if(physicalSelected?!!physicalStop:!warpAllowed){if(physicalSelected)$('#warpStatus','small').textContent='通常速度へ：'+physicalStop;else if(Number($('#warp','select').value)>1)$('#warpStatus','small').textContent=maneuverPanel.active&&maneuverWarp<=0?'通常速度へ：自動噴射の姿勢合わせ（開始の90秒前から）':'通常速度へ：操作・推力・高度・噴射時刻を確認';$('#warp','select').value='1';}const selectedWarp=Number($('#warp','select').value);if(selectedWarp>50){physicsClock.reset();try{const world=currentWorldRuntime();world.replace(S.flight);const result=world.coast(Math.max(.000001,Math.min(dt*selectedWarp,maneuverWarp)),{input:keys.size>0||!!S.launchPilot,maxSteps:64});showCoastBlocker(result.blocker);$('#warpStatus','small').textContent=result.reason?'通常速度へ：'+showCoastBlocker(result.blocker):'高速航行中 · 姿勢固定 / SAS・RCS停止 · 発電・冷却は継続';if(result.reason)$('#warp','select').value='1';else if(result.remaining>.01)$('#warpStatus','small').textContent+=' · 処理上限に合わせ減速';}catch(error){$('#warp','select').value='1';$('#warpStatus','small').textContent='通常速度へ：'+errorMessage(error);}}else{const physicsResult=physicsClock.advance(dt,selectedWarp,()=>{if(S.launchPilot){const piloted=currentFlight();if(keys.size||piloted.crashed){S.launchPilot=null;$('#autoLaunch','button').textContent='自動軌道投入（見本用）';}else{const ids=new Set(piloted.parts.map(p=>p.id));S.launchPilot.update(piloted);$('#brake','button').classList.toggle('active',piloted.brake);$('#brake','button').textContent='BRAKE '+(piloted.brake?'ON':'OFF');$('#sas','button').classList.toggle('active',piloted.sas);$('#sas','button').textContent='SAS '+(piloted.sas?'ON':'OFF');for(const id of ids)if(!piloted.parts.some(p=>p.id===id)){const object=objects.get(id);if(object)object.visible=false;}}}maneuverPanel.step(currentFlight(),1/120);orbitalPanel.step(currentFlight(),1/120);const autopilotCommands=cruisePanel.step(currentFlight(),1/120);const dockingCommands=dockingPilot.active?dockingPilot.step(currentFlight(),1/120):{};const stepped=currentFlight(),world=currentWorldRuntime();world.replace(stepped);world.step(1/120,{portForward:((keys.has('KeyI')?1:0)-(keys.has('KeyK')?1:0))*Number($('#portPower','select').value)/100,portRight:((keys.has('KeyL')?1:0)-(keys.has('KeyJ')?1:0))*Number($('#portPower','select').value)/100,portUp:((keys.has('KeyU')?1:0)-(keys.has('KeyO')?1:0))*Number($('#portPower','select').value)/100,translateX:(keys.has('KeyL')?1:0)-(keys.has('KeyJ')?1:0),translateY:(keys.has(stepped.rocketAxes?'KeyI':'KeyU')?1:0)-(keys.has(stepped.rocketAxes?'KeyK':'KeyO')?1:0),translateZ:(keys.has(stepped.rocketAxes?'KeyO':'KeyI')?1:0)-(keys.has(stepped.rocketAxes?'KeyU':'KeyK')?1:0),precision:$('#precisionControl','button').getAttribute('aria-pressed')==='true',drive:(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),pitch:(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),yaw:(keys.has('KeyA')?1:0)-(keys.has('KeyD')?1:0),roll:(keys.has('KeyQ')?1:0)-(keys.has('KeyE')?1:0),...autopilotCommands,...dockingCommands});updateFlightChallenges();if(S.launchPilot?.done){const completionMessage=S.launchPilot.completionMessage;S.launchPilot=null;$('#autoLaunch','button').textContent='自動軌道投入（見本用）';notify(completionMessage);}if(selectedWarp>1&&physicalWarpStop(currentFlight(),keys.size>0)){$('#warp','select').value='1';$('#warpStatus','small').textContent='通常速度へ：'+physicalWarpStop(currentFlight(),keys.size>0);return false;}});if(Number($('#warp','select').value)>1)$('#warpStatus','small').textContent='物理計算 '+selectedWarp+'倍 · 推力・空力・熱・接地を継続'+(physicsResult.limited?' · 処理上限に合わせ減速':'');}}syncEngineShrouds(S.flight.parts,objects,assets.get('engine-shroud'));craftRoot.position.copy(S.flight.pos);craftRoot.quaternion.copy(S.flight.q);for(const [id,o]of objects){o.visible=S.flight.parts.some(p=>p.id===id);if(o.visible)markWreckVisual(o,S.flight);}for(const p of S.flight.parts){const o=objects.get(p.id);updateRCSVisual(o,S.flight);if(o)syncCargoVisual(o,p,PARTS[p.type]);if(o?.userData.hinge)o.userData.hinge.rotation.x=S.flight.deflections.get(p.id)||0;if(o?.userData.gimbal){const g=S.flight.gimbals.get(p.id);o.userData.gimbal.rotation.set(g?.x||0,0,g?.z||0);}if(o?.userData.rollingVisual){const wheel=S.flight.wheelMotion.get(p.id);o.userData.steeringVisual.position.y=-(wheel?.extension??0);o.userData.steeringVisual.rotation.y=wheel?.steer||0;o.userData.rollingVisual.rotation.x=wheel?.angle||0;}}for(const [id,canopy]of parachuteVisuals){const chute=S.flight.chutes.get(id),p=S.flight.parts.find(p=>p.id===id);canopy.visible=!!p&&!!chute&&chute.fraction>0;if(p&&chute&&canopy.visible){canopy.position.fromArray(p.p).applyQuaternion(S.flight.q).add(S.flight.pos);canopy.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),bodyUp(canopy.position,S.flight.universalTime));const scale=Math.sqrt(chute.fraction);canopy.scale.set(scale,.45+.55*scale,scale);if(!S.chuteFramed&&chute.fraction>.1){const offset=camera.position.clone().sub(controls.target);camera.position.copy(controls.target).add(offset.setLength(Math.max(50,offset.length())));S.chuteFramed=true;}}}$('#chuteStatus','small').textContent=[...S.flight.chutes.values()].map(c=>'パラシュート：'+chuteNames[c.status]).join(' · ');$('#aeroFlight','small').textContent=`失速域の翼: ${S.flight.telemetry.stallCount||0} · 接地輪: ${S.flight.telemetry.contacts||0}`;updateDebrisVisuals(S.flight,now);const focus=S.trackedDebris?vesselCenter(S.trackedDebris):flightCenter(),delta=focus.clone().sub(flightFocus);camera.position.add(delta);controls.target.add(delta);flightFocus.copy(focus);sun.position.copy(S.flight.pos).add(new T.Vector3(12,24,12));sun.target.position.copy(S.flight.pos);for(const e of exhaust){updateEnginePlume(e.mesh,S.flight.engineThrust.get(e.id)||0,S.flight.crashed,now);}$('#alt','strong').textContent=(S.flight.orbit?.altitude||0).toFixed(1);$('#speed','strong').textContent=navigationVelocity(flightCenter(),S.flight.vel,S.flight.universalTime,S.flight.navigationFrame).length().toFixed(1);$('#navigationFrame','button').textContent=S.flight.navigationFrame==='surface'?'対地速度':'軌道速度';$('#navigationAuto','button').setAttribute('aria-pressed',String(S.flight.navigationAuto!==false));$('#vspeed','strong').textContent=(S.flight.orbit?.vertical||0).toFixed(1);$('#throttleVal','b').textContent=Math.round(S.flight.throttle*100)+'%';$('#activeVessel','span').textContent=(canControl(S.flight)?'操縦中：':'観察中：')+(S.flight.vesselName?S.flight.vesselName+' · ':'')+(controlName(S.flight.parts))+' · '+S.flight.parts.length+'部品';$('#universalTime','div').textContent=formatUniversalTime(S.flight.universalTime)+' · 宇宙の共通時刻';$('#flightStatus','span').textContent=S.flight.crashed?([...S.flight.thermal.values()].some(s=>s.failed)?'熱損傷 — 耐熱限界を超えました':'機体損傷 — 組立棟で設計を見直してください'):`T+ ${S.flight.time.toFixed(1)}s · 燃料 ${Math.round(S.flight.fuelRatio*100)}% · ${S.launchPilot?S.launchPilot.message:S.flight.landed?'着地':S.flight.started?'試験中':['orbit','moon-orbit','moon-surface','transfer'].includes(S.flight.environment)?'初期円軌道・惰性飛行':S.flight.environment==='entry'?'再突入試験 · SAS逆行で遮熱':S.flight.environment==='drop'?'カプセル降下試験':'点火待機'}`;if(now-S.infoTime>250){failureLog.update(S.flight);updateInfo();updateOrbit();updateNavigation();updateDebrisList();S.infoTime=now;}}
 if(S.flight&&flightPause.paused){keys.clear();physicsClock.reset();flightPause.refresh();$('#stage','button').disabled=true;}
 setCameraUp(S.flight?bodyUp(S.trackedDebris?vesselCenter(S.trackedDebris):flightCenter(),S.flight.universalTime):new T.Vector3(0,1,0));{const cameraDt=S.cameraKeyTime===null?0:Math.min(.1,(now-S.cameraKeyTime)/1000);S.cameraKeyTime=now;if(!S.atCenter)orbitByArrows(controls,cameraKeys,cameraDt);}controls.update();if(S.flight){const viewed=S.trackedDebris||S.flight,body=referenceBody(controls.target,S.flight.universalTime);if(viewed.environment!=='water'||body.id!=='planet')constrainSurfaceCamera(controls,bodyState(body,S.flight.universalTime).position,body.radius);}if(!S.flight)updatePlacementCopies();if(S.flight)updateWorldGeometry();if(S.flight)scene.fog=S.flightScenery?.update(camera,S.flight.universalTime,sun,ambient,[planetMaterial,patchMaterial],S.flight.environment==='water')||null;if(highlight.visible)highlight.update();if(partHover.visible){craftRoot.updateWorldMatrix(true,true);partHover.update();}deliveryPanel.updateMarker(camera,viewport.clientWidth,viewport.clientHeight);renderer.render(scene,camera);}
const gameAudio=mountFlightAudio();
requestAnimationFrame(animate);
wireCatalog();
async function boot(){try{$('#catalogCount','span').textContent=String(Object.keys(PARTS).length);await loadAssets();catalog();restoreWorkspace();rebuild();frame();$('#loading','div').hidden=true;await initializeCenter();}catch(e){console.error(e);$('#loading','div').innerHTML='<strong>部品を読み込めませんでした</strong><span>ページを再読み込みしてください。</span>';}}
boot();


wireDockingPorts();

function flightRecord(){updateExploration();const recorded=currentFlight(),pilot=S.launchPilot?{kind:S.launchPilot instanceof ReturnPilot?'return':'launch',done:S.launchPilot.done,released:!!S.launchPilot.released}:null;return saveFlight(recorded,{blueprint:S.parts.length?S.parts:recorded.parts,name:recorded.vesselName||S.activeFlightName||$('#craftName','input').value,pilot,worldHistory:S.parkedWorld?.history??[]});}
function parkFlight(){cruisePanel.stop();if(S.flight){S.universalTime=S.flight.universalTime;S.parkedWorld=worldFromFlight(flightRecord());}keys.clear();physicsClock.reset();}
function persistWorkspace(){
 if(S.workspaceError)return false;
 try{
  if(S.practiceSession){S.practiceSession.saveHome(localStorage);return true;}
  const world=S.flight?worldFromFlight(flightRecord()):S.parkedWorld??worldFromFlight(null,{universalTime:S.universalTime});
  writeStoredGame(localStorage,gameRecord({world,draft:{parts:S.parts,name:$('#craftName','input').value,bay:S.bayMode,environment:$('#environment','select').value}}));
  return true;
 }catch(e){$('#centerNotice','p').textContent='ブラウザへの保存に失敗しました。ページを閉じず、機体JSON出力・飛行保存を確認してください。';return false;}
}
function restoreWorkspace(){
 try{
  const saved=readStoredGame(localStorage);if(!saved)return;
  const {game,migrated}=saved,w=game.workshop,record=flightFromWorld(game.world),notices=[];
  if(migrated)notices.push('旧保存を読み込みました。次の自動保存から世界と設計を分けて記録します。旧保存はブラウザ内に残します。');
  if(record?.physicsMigration)notices.push(physicsMigrationMessage(record.physicsMigration));
  $('#centerNotice','p').textContent=notices.join(' ');
  S.universalTime=game.world.universalTime;S.parts=w.parts;$('#craftName','input').value=w.name;setBay(w.bay);$('#environment','select').value=w.environment;updateDepartureButton(document,w.environment);S.parkedWorld=game.world;
 }catch(e){
  S.workspaceError=true;$('#centerNotice','p').textContent='保存を復元できませんでした。元データを残して自動保存を停止しています。'+errorMessage(e);
  const reset=document.createElement('button');reset.textContent='元データを退避して新しく始める';
  reset.onclick=()=>{try{
   backupStoredGame(localStorage);S.workspaceError=false;
   if(!persistWorkspace()){S.workspaceError=true;throw Error('新しい保存を作成できませんでした');}
   $('#centerNotice','p').textContent='以前の保存をブラウザ内のバックアップへ退避しました。';reset.remove();
  }catch{S.workspaceError=true;reset.textContent='退避または保存に失敗しました。保存容量を確認してください';}};
  $('#centerNotice','p').after(reset);
 }
}
function refreshHistory(){
 const list=$('#worldHistoryRows','ol');list.replaceChildren();const events=S.parkedWorld?.history??[];$('#worldHistoryCount','span').textContent=String(events.length);
 if(!events.length){const empty=document.createElement('p');empty.textContent='出発・回収・運用終了の記録はまだありません。旧保存の過去の操作は記録されません。';list.append(empty);return;}
 for(const event of [...events].reverse().slice(0,50)){const row=document.createElement('li');row.textContent=formatUniversalTime(event.universalTime)+' · '+event.name+' · '+historyActionLabel(event)+' · '+event.parts+'部品'+(event.type==='launch'?'':' · T+ '+event.missionTime.toFixed(1)+' s');list.append(row);}
 if(events.length>50){const note=document.createElement('p');note.textContent='最新50件を表示しています。過去の記録も保存しています。';list.append(note);}
}
function refreshCenter(){deliveryPanel.update();refreshHistory();$('#centerTime','p').textContent=formatUniversalTime(S.universalTime)+' · 共通時刻は停止中';let designCount=0,libraryError=false;try{designCount=loadDesigns().designs.length;}catch{libraryError=true;}const vesselCount=S.parkedWorld?(worldTrackingList)(S.parkedWorld).length:0,history=S.parkedWorld?.history??[];renderFirstSteps($('#centerFirstSteps','section'),{visible:!libraryError&&isFirstVisit({historyCount:history.length,vesselCount,designCount}),onStart:()=>enterWorkshop('vab')});const guide=$('#centerGuide','ol');guide.replaceChildren();for(const item of centerGuidance({partCount:S.parts.length,designCount,vesselCount,libraryError,history})){const row=document.createElement('li'),title=document.createElement('b'),text=document.createElement('span');title.textContent=item.title;text.textContent=item.text;row.classList.toggle('completed',item.completed);row.append(title,text);guide.append(row);}const name=$('#craftName','input').value;$('#centerDraft','p').textContent=name+' · '+S.parts.length+'部品 · '+S.bayMode.toUpperCase();const centerWorld=S.parkedWorld,active=centerWorld?.vessels.find(v=>v.vesselId===centerWorld.activeVesselId)||centerWorld?.vessels[0];$('#centerResume','button').disabled=!S.centerReady||!active;$('#centerFlightInfo','p').textContent=active&&centerWorld?(active.vesselName||centerWorld.flightMeta?.name||'機体')+' · T+ '+active.state.time.toFixed(1)+'s · '+active.parts.length+'部品 · 保持 '+centerWorld.vessels.length+'機 · 一時停止中':'進行中の飛行はありません。';}
function showCenter(){designPartWindows.clear();if(S.practiceSession)finishPractice();else {parkFlight();if(S.flight)endFlight();}cancelPlacement();$('#orbitOverlay','section').hidden=true;S.atCenter=true;buoyancyPanel.update();document.title='Omnivehicle · 宇宙センター';document.body.classList.add('at-center');$('#spaceCenter','section').hidden=false;keys.clear();persistWorkspace();refreshCenter();S.centerView?.resize();}
function enterWorkshop(bay:string){if(!S.centerReady)return;S.atCenter=false;document.title='Omnivehicle · '+bay.toUpperCase();$('#spaceCenter','section').hidden=true;document.body.classList.remove('at-center');setBay(bay);keys.clear();S.last=performance.now();resize();frame();persistWorkspace();}
function resumeFromCenter(selection:{world:SavedWorld;observe:string|null}|null=null){if(!S.parkedWorld?.vessels.length)return;const draft={parts:S.parts,name:$('#craftName','input').value,environment:$('#environment','select').value,bay:S.bayMode};const record=flightFromWorld(selection?.world||S.parkedWorld);enterWorkshop(S.bayMode);if(record&&restoreFlight(record)){S.parts=draft.parts;$('#craftName','input').value=draft.name;$('#environment','select').value=draft.environment;S.bayMode=draft.bay;S.parkedWorld=selection?.world||S.parkedWorld;if(selection?.observe){const resumed=currentFlight(),observed=fleet(resumed).find(v=>v.vesselId===selection.observe);if(!observed)throw Error('観察する機体が見つかりません');S.trackedDebris=observed;const focus=vesselCenter(observed);frameTrackedVessel(controls,focus,bodyUp(focus,resumed.universalTime));flightFocus.copy(focus);}persistWorkspace();}else{if(!record)notify('再開する機体の記録がありません');showCenter();}}
function requestLaunch(){launchAdditional({parts:S.parts,name:$('#craftName','input').value,environment:$('#environment','select').value,bay:S.bayMode,...($('#environment','select').value==='orbit'&&$('#targetPractice','select').value?{practiceScenario:$('#targetPractice','select').value}:{})});}

async function initializeCenter(){S.centerReady=true;$('#enterVAB','button').disabled=false;$('#enterSPH','button').disabled=false;for(const id of ['centerTracking','centerPad','centerRunway'])$('#'+id,'button').disabled=false;S.centerView=new SpaceCenter($('#centerScene','canvas'),openCenterFacility,highlightCenterFacility);try{await S.centerView.load();$('#centerLoading','div').hidden=true;}catch(e){$('#centerLoading','div').textContent='3D施設を読み込めませんでした。左のボタンから組立棟へ入れます。';console.error(e);}refreshCenter();}
$('#toCenter','button').onclick=showCenter;$('#enterVAB','button').onclick=()=>enterWorkshop('vab');$('#enterSPH','button').onclick=()=>enterWorkshop('sph');$('#centerResume','button').onclick=()=>resumeFromCenter();
window.addEventListener('beforeunload',()=>{if(S.centerReady)persistWorkspace();});

$('#save','button').onclick=saveDesign;
function highlightCenterFacility(id:string|null){const facility=Object.entries(CENTER_FACILITIES).find(([key])=>key===id)?.[1];$('#centerFacilityName','h2').textContent=facility?.name||'施設を選んで出発';$('#centerFacilityDescription','p').textContent=facility?.description||'建物にポインターを合わせると役割を表示します。';for(const [key,item]of Object.entries(CENTER_FACILITIES))$('#'+item.button,'button').classList.toggle('facilityHighlighted',key===id);}
for(const [id,item]of Object.entries(CENTER_FACILITIES)){const button=$('#'+item.button,'button');button.addEventListener('pointerenter',()=>S.centerView?.pointFacility(id));button.addEventListener('pointerleave',()=>S.centerView?.pointFacility(null));button.addEventListener('focus',()=>S.centerView?.focusFacility(id));button.addEventListener('blur',()=>S.centerView?.focusFacility(null));}
function openCenterFacility(id:string){if(id==='vab'||id==='sph'){enterWorkshop(id);return;}if(id==='tracking')openTracking();else if(id==='pad'||id==='runway')openLaunchLibrary(id);}

$('#centerTracking','button').onclick=()=>openTracking();$('#centerPad','button').onclick=()=>openLaunchLibrary('pad');$('#centerRunway','button').onclick=()=>openLaunchLibrary('runway');

$('#load','button').onclick=()=>{if(!S.flight)openLaunchLibrary('workshop');};

function finishPractice(){
 if(!S.practiceSession)return;
 const home=S.practiceSession.home;
 if(S.flight)endFlight();S.practiceSession=null;
 S.parkedWorld=home.world;S.universalTime=home.world.universalTime;
 S.parts=home.workshop.parts;$('#craftName','input').value=home.workshop.name;
 setBay(home.workshop.bay);$('#environment','select').value=home.workshop.environment;
 keys.clear();physicsClock.reset();rebuild();frame();updateInfo();
 notify('練習を終了しました。通常世界の機体・時刻・設計に戻りました。');
}
function isLaunchSiteError(e:unknown):e is import('./launch-clearance.js').LaunchSiteError{return e instanceof Error&&(!('blockers' in e)||e.blockers===undefined||Array.isArray(e.blockers));}
function launchAdditional(design:import('./practice-session.js').PracticeDesign&{bay?:string}){
 if(S.flight||S.practiceSession){notify('現在の飛行を終了してから出発してください');return;}
 let next:Flight|null=null,candidate:PracticeSession|null=null;
 const draft={parts:S.parts,name:$('#craftName','input').value,environment:$('#environment','select').value,bay:S.bayMode};
 try{
  const home=gameRecord({world:S.parkedWorld??worldFromFlight(null,{universalTime:S.universalTime}),draft});
  const practice=departureMode(design.environment).mode==='practice';
  if(practice){
   if(S.workspaceError)throw Error('通常世界の保存エラーを解消してから練習を開始してください');
   candidate=new PracticeSession(home,design);candidate.saveHome(localStorage);
  }
  const launchedWorld=candidate?candidate.initialWorld:launchWorld(home.world,design);
  const launchedRecord=flightFromWorld(launchedWorld);if(!launchedRecord)throw Error('出発した機体の記録がありません');next=loadFlight(launchedRecord);S.launchPartOrigins=new Map(next.parts.map((p,i)=>[p.id,design.parts[i]?.id]));
  S.practiceSession=candidate;$('#modal','dialog').close();enterWorkshop(design.bay||S.bayMode);
  S.parts=structuredClone(next.parts);$('#craftName','input').value=next.vesselName;
  $('#environment','select').value=next.environment;rebuild();startFlight(next);S.activeFlightName=next.vesselName;
  S.parkedWorld=launchedWorld;S.parts=draft.parts;$('#craftName','input').value=draft.name;
  $('#environment','select').value=draft.environment;S.bayMode=draft.bay;persistWorkspace();
  if(practice)notify('独立した練習を開始しました。通常世界は停止・保持されています。');else{const departure=launchedWorld.history.at(-1);if(!departure)throw Error('出発の記録がありません');notify(historyActionLabel(departure)+' · 他の機体 '+(fleet(currentFlight()).length-1)+'機を保持');}
 }catch(e){
  if(S.practiceSession){if(next===S.flight)next=null;finishPractice();}
  if(next&&next!==S.flight)next.dispose();
  S.parts=draft.parts;$('#craftName','input').value=draft.name;$('#environment','select').value=draft.environment;S.bayMode=draft.bay;
  notify(errorMessage(e));
  if(isLaunchSiteError(e)&&e.code==='launch_site_occupied'){const blockers=e.blockers;if(!blockers)throw Error('出発地点を使用中の機体が分かりません');showModal('<h2>出発地点を使用中</h2><div id="launchBlockers"></div>');for(const item of blockers){const row=document.createElement('article'),name=document.createElement('strong'),button=document.createElement('button');row.className='facilityRow';name.textContent=item.name;button.textContent='追跡施設で確認';button.onclick=()=>{showCenter();openTracking(item.id);};row.append(name,button);$('#launchBlockers','div').append(row);}return;}
  if($('#modal','dialog').open){const message=document.createElement('p');message.textContent=errorMessage(e);$('#modalBody','div').append(message);}
 }
}



const {maneuverPanel,orbitalPanel,cruisePanel,flightPause,dockingWindow,deliveryPanel,buoyancyPanel}=mountFlightPanels(thrustOverlay);

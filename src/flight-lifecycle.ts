// Flight lifecycle (BACKLOG 7c, moved from app.ts unchanged): starting a flight from the workshop craft or a
// restored flight, syncing the flight controls, switching the controlled vessel, ending the flight, staging,
// and replacing the flight after docking (kept separate from switchVessel: it does not select the vessel
// through the fleet and does not notify). Calls up into app.ts through app-hooks. No import-time side effects.
import * as T from 'three';
import {createEnginePlume} from './engine-plume.js';
import {updateFlightControls} from './flight-controls.js';
import {WorldRuntime} from './world-runtime.js';
import {selectVessel, canControl} from './fleet.js';
import {PARTS} from './catalog.js';
import {Flight} from './core.js';
import {ignitionHint} from './first-steps.js';
import {launchHint} from './vessel-controls.js';
import {state} from './app-state.js';
import {hooks} from './app-hooks.js';
import {$, errorMessage, notify} from './ui-common.js';
import {currentFlight} from './current-flight.js';
import {sceneCore, editorMarkers, selectionOverlays, objects, partObject, frame} from './scene.js';
import {cloneModel} from './part-visuals.js';
import {buildTestWorld} from './flight-world.js';
import {clearInterferenceHighlight} from './workshop-panels.js';
import {cancelPlacement} from './workshop-place.js';
import {setBay} from './workshop-toolbar.js';
import {updateOrbit} from './orbit-map-ui.js';
import {keys, physicsClock, gameAudio} from './flight-shared.js';
import {flightPanels, partWindowPanels} from './flight-panels.js';
import {updateInfo} from './info-hub.js';
import {parachuteVisuals, debrisVisuals, exhaust} from './flight-visuals.js';
import {showCoastBlocker, updateDebrisList, updateNavigation} from './flight-hud.js';
export function startFlight(restored: Flight | null = null) {
  const {maneuverPanel, orbitalPanel, cruisePanel, trajectoryPanel} = flightPanels(),
    {partWindows, designPartWindows} = partWindowPanels(),
    {scene, controls, bay, testWorld, craftRoot} = sceneCore(),
    {gizmo, comMarker, aeroMarker} = editorMarkers(),
    {highlight} = selectionOverlays();
  maneuverPanel.stop();
  orbitalPanel.stop();
  cruisePanel.stop();
  partWindows.clear();
  designPartWindows.clear();
  trajectoryPanel.reset();
  if (!state.parts.length) {
    notify('まず機体を組み立ててください');
    return;
  }
  if (!(restored instanceof Flight) && !state.parts.some(p => PARTS[p.type].control)) {
    notify('試験には制御ユニットが必要です');
    return;
  }
  if (state.parts.filter(p => !p.parent).length !== 1) {
    notify('独立した部品を接続してから試験してください');
    return;
  }
  cancelPlacement();
  clearInterferenceHighlight();
  gizmo.detach();
  highlight.visible = false;
  comMarker.visible = false;
  aeroMarker.visible = false;
  state.flight =
    restored instanceof Flight
      ? restored
      : new Flight(state.parts, $('#environment', 'select').value, state.universalTime);
  if (!(restored instanceof Flight)) state.flight.universalTime = state.universalTime;
  state.universalTime = state.flight.universalTime;
  if (state.worldRuntime) state.worldRuntime.replace(state.flight);
  else state.worldRuntime = new WorldRuntime(state.flight);
  updateFlightControls(document, state.flight);
  if (!(restored instanceof Flight)) state.activeFlightName = $('#craftName', 'input').value;
  state.launchPilot = null;
  $('#autoLaunch', 'button').textContent = '自動軌道投入（見本用）';
  $('#autoLaunch', 'button').hidden = true;
  physicsClock.reset();
  state.trackedDebris = null;
  debrisVisuals.clear();
  buildTestWorld(state.flight.universalTime);
  parachuteVisuals.clear();
  state.chuteFramed = false;
  for (const p of state.flight.parts)
    if (PARTS[p.type].parachute) {
      const canopy = cloneModel('parachute-open');
      canopy.visible = false;
      testWorld.add(canopy);
      parachuteVisuals.set(p.id, canopy);
    }
  $('#armChutes', 'button').hidden = !parachuteVisuals.size;
  $('#autoReturn', 'button').hidden =
    ['moon-orbit', 'moon-surface', 'transfer'].includes(state.flight.environment) ||
    !parachuteVisuals.size ||
    !state.flight.parts.some(p => PARTS[p.type].decoupler) ||
    !state.flight.parts.some(p => PARTS[p.type].thrust);
  testWorld.visible = true;
  bay.visible = false;
  scene.background = new T.Color('#8eb5c8');
  scene.fog = new T.Fog('#9fbdc5', 300, 2000);
  document.body.classList.add('flying');
  $('#flightHud', 'div').hidden = false;
  $('#launch', 'button').disabled = true;
  $('#throttle', 'input').value = '0';
  $('#ballast', 'input').value = '0';
  $('#trim', 'input').value = '0';
  $('#trimVal', 'b').textContent = '0%';
  $('#sas', 'button').classList.add('active');
  $('#sas', 'button').textContent = 'SAS ON';
  $('#brake', 'button').classList.add('active');
  $('#brake', 'button').textContent = 'BRAKE ON';
  controls.maxDistance = 2000000;
  $('#warp', 'select').value = '1';
  $('#warpStatus', 'small').textContent = '通常速度 · 1倍';
  showCoastBlocker(null);
  for (const p of state.parts) {
    if (PARTS[p.type].thrust && PARTS[p.type].thrustMedium !== 'water') {
      const object = partObject(p.id),
        flame = createEnginePlume(PARTS[p.type], !!object.userData.gimbal);
      const target = object.userData.gimbal || object;
      target.add(flame);
      exhaust.push({id: p.id, mesh: flame});
    }
  }
  craftRoot.position.copy(state.flight.pos);
  craftRoot.quaternion.copy(state.flight.q);
  for (const [id, o] of objects) o.visible = state.flight.parts.some(p => p.id === id);
  frame();
  updateInfo();
  if (state.flight.transferGuide) $('#inspector', 'aside').scrollTop = 0;
  notify(
    state.flight.environment === 'moon-surface'
      ? '月面で待機。右の再離陸手順を開き、Space点火・30%で上昇。'
      : state.flight.environment === 'moon-orbit'
        ? '月の高度20 km円軌道から開始。月基準の速度を表示します。'
        : state.flight.environment === 'orbit'
          ? '高度80 kmの初期円軌道から開始。無推力で周回します。'
          : launchHint(
              state.flight.parts,
              document.body.classList.contains('touch'),
              state.flight.driveEnabled
            ) || '使える操作は左の「この機体で使える操作」にあります'
  );
}
export function syncFlightControls() {
  const fl = currentFlight();
  for (const k of ['reactionEnabled', 'steeringEnabled', 'driveEnabled', 'rcsEnabled'] as const)
    $('#' + k, 'input').checked = fl[k];
  $('#throttle', 'input').value = String(fl.throttle * 100);
  $('#ballast', 'input').value = String(fl.ballast * 100);
  $('#trim', 'input').value = String(fl.trim * 100);
  $('#trimVal', 'b').textContent = Math.round(fl.trim * 100) + '%';
  $('#sas', 'button').textContent = 'SAS ' + (fl.sas ? 'ON' : 'OFF');
  $('#sas', 'button').classList.toggle('active', fl.sas);
  $('#brake', 'button').textContent = 'BRAKE ' + (fl.brake ? 'ON' : 'OFF');
  $('#brake', 'button').classList.toggle('active', fl.brake);
  updateInfo();
  updateNavigation();
  updateOrbit();
  updateDebrisList();
}
export function switchVessel(target: Flight) {
  try {
    const next = selectVessel(currentFlight(), target),
      blueprint = state.parts;
    keys.clear();
    state.launchPilot = null;
    exhaust.forEach(e => {
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
    });
    exhaust.length = 0;
    state.flight = next;
    state.parts = structuredClone(next.parts);
    hooks.rebuild();
    startFlight(next);
    state.parts = blueprint;
    syncFlightControls();
    const control = currentFlight().parts.find(p => PARTS[p.type].control);
    if (!control) throw Error('制御ユニットが見つかりません');
    notify('操縦対象を変更しました · ' + PARTS[control.type].name);
  } catch (e) {
    notify(errorMessage(e));
  }
}
export function endFlight() {
  const {maneuverPanel, orbitalPanel, cruisePanel, flightPause, dockingWindow, trajectoryPanel} =
      flightPanels(),
    {partWindows, designPartWindows} = partWindowPanels(),
    {scene, controls, ambient, sun, bay, testWorld, craftRoot} = sceneCore();
  maneuverPanel.stop();
  maneuverPanel.close();
  orbitalPanel.stop();
  orbitalPanel.close();
  cruisePanel.stop();
  cruisePanel.close();
  flightPause.set(false);
  dockingWindow.close();
  partWindows.clear();
  designPartWindows.clear();
  sun.intensity = 2.4;
  ambient.intensity = 0.9;
  trajectoryPanel.reset();
  if (state.flight) state.universalTime = state.flight.universalTime;
  $('#dockingPanel', 'details').hidden = true;
  state.trackedDebris = null;
  debrisVisuals.clear();
  $('#orbitOverlay', 'section').hidden = true;
  state.launchPilot = null;
  state.flight?.dispose();
  state.flight = null;
  state.worldRuntime = null;
  exhaust.forEach(e => {
    e.mesh.geometry.dispose();
    e.mesh.material.dispose();
  });
  exhaust.length = 0;
  craftRoot.position.set(0, 0, 0);
  craftRoot.quaternion.identity();
  testWorld.visible = false;
  bay.visible = true;
  scene.background = new T.Color('#293c49');
  scene.fog = new T.Fog('#293c49', 55, 135);
  document.body.classList.remove('flying');
  $('#flightHud', 'div').hidden = true;
  $('#launch', 'button').disabled = false;
  controls.maxDistance = 80;
  sun.position.set(12, 24, 12);
  sun.target.position.set(0, 0, 0);
  hooks.rebuild();
  frame();
  const environment = $('#environment', 'select').value;
  setBay(state.bayMode);
  $('#environment', 'select').value = environment;
}
export function stage() {
  if (!state.flight || !canControl(state.flight)) return;
  const firstStage = !state.flight.started,
    removed = state.flight.stageNext(),
    hint = ignitionHint({
      firstStage,
      throttle: state.flight.throttle,
      touch: document.body.classList.contains('touch'),
      thrust: state.flight.parts.some(p => PARTS[p.type].thrust)
    });
  gameAudio().play('stage');
  updateFlightControls(document, state.flight);
  for (const id of removed) {
    const o = objects.get(id);
    if (o) o.visible = false;
  }
  notify(
    `ステージ ${String(state.flight.stage).padStart(2, '0')} 実行${removed.size ? ' / ' + removed.size + ' 部品分離' : ''}` +
      (hint ? ' · ' + hint : '')
  );
  $('#brake', 'button').classList.toggle('active', state.flight.brake);
  $('#brake', 'button').textContent = 'BRAKE ' + (state.flight.brake ? 'ON' : 'OFF');
}
export function refreshDockedFlight(next: Flight) {
  const blueprint = state.parts;
  keys.clear();
  state.launchPilot = null;
  for (const e of exhaust) {
    e.mesh.geometry.dispose();
    e.mesh.material.dispose();
  }
  exhaust.length = 0;
  state.flight = next;
  state.parts = structuredClone(next.parts);
  hooks.rebuild();
  startFlight(next);
  state.parts = blueprint;
  syncFlightControls();
}

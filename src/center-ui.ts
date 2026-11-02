// Space center UI (BACKLOG 7c, moved from app.ts unchanged): the world history list, the center summary and
// guidance, returning to the center, entering a workshop, resuming a parked flight, the 3D center and its
// facility buttons. No import-time side effects; app.ts calls wireCenterButtons and wireCenterFacilities at
// the original places and awaits initializeCenter in boot.
import {renderFirstSteps, isFirstVisit} from './first-steps.js';
import {frameTrackedVessel} from './camera-up.js';
import {historyActionLabel} from './departure-mode.js';
import {formatUniversalTime} from './universal-time.js';
import {worldTrackingList} from './world-operations.js';
import {fleet} from './fleet.js';
import {CENTER_FACILITIES, centerGuidance} from './center-facilities.js';
import {SpaceCenter} from './space-center.js';
import {flightFromWorld, type SavedWorld} from './world-save.js';
import {bodyUp} from './celestial.js';
import {state} from './app-state.js';
import {$, notify} from './ui-common.js';
import {currentFlight, vesselCenter} from './current-flight.js';
import {sceneCore, flightFocus, resize, frame} from './scene.js';
import {openTracking} from './tracking-recovery.js';
import {loadDesigns, openLaunchLibrary} from './design-library-ui.js';
import {cancelPlacement} from './workshop-place.js';
import {setBay} from './workshop-toolbar.js';
import {keys} from './flight-shared.js';
import {flightPanels, partWindowPanels} from './flight-panels.js';
import {endFlight} from './flight-lifecycle.js';
import {parkFlight, persistWorkspace} from './workspace-ui.js';
import {restoreFlight} from './quick-save.js';
import {finishPractice} from './launch-ui.js';
function refreshHistory() {
  const list = $('#worldHistoryRows', 'ol');
  list.replaceChildren();
  const events = state.parkedWorld?.history ?? [];
  $('#worldHistoryCount', 'span').textContent = String(events.length);
  if (!events.length) {
    const empty = document.createElement('p');
    empty.textContent = '出発・回収・運用終了の記録はまだありません。旧保存の過去の操作は記録されません。';
    list.append(empty);
    return;
  }
  for (const event of [...events].reverse().slice(0, 50)) {
    const row = document.createElement('li');
    row.textContent =
      formatUniversalTime(event.universalTime) +
      ' · ' +
      event.name +
      ' · ' +
      historyActionLabel(event) +
      ' · ' +
      event.parts +
      '部品' +
      (event.type === 'launch' ? '' : ' · T+ ' + event.missionTime.toFixed(1) + ' s');
    list.append(row);
  }
  if (events.length > 50) {
    const note = document.createElement('p');
    note.textContent = '最新50件を表示しています。過去の記録も保存しています。';
    list.append(note);
  }
}
export function refreshCenter() {
  flightPanels().deliveryPanel.update();
  refreshHistory();
  $('#centerTime', 'p').textContent = formatUniversalTime(state.universalTime) + ' · 共通時刻は停止中';
  let designCount = 0,
    libraryError = false;
  try {
    designCount = loadDesigns().designs.length;
  } catch {
    libraryError = true;
  }
  const vesselCount = state.parkedWorld ? worldTrackingList(state.parkedWorld).length : 0,
    history = state.parkedWorld?.history ?? [];
  renderFirstSteps($('#centerFirstSteps', 'section'), {
    visible: !libraryError && isFirstVisit({historyCount: history.length, vesselCount, designCount}),
    onStart: () => enterWorkshop('vab')
  });
  const guide = $('#centerGuide', 'ol');
  guide.replaceChildren();
  for (const item of centerGuidance({
    partCount: state.parts.length,
    designCount,
    vesselCount,
    libraryError,
    history
  })) {
    const row = document.createElement('li'),
      title = document.createElement('b'),
      text = document.createElement('span');
    title.textContent = item.title;
    text.textContent = item.text;
    row.classList.toggle('completed', item.completed);
    row.append(title, text);
    guide.append(row);
  }
  const name = $('#craftName', 'input').value;
  $('#centerDraft', 'p').textContent =
    name + ' · ' + state.parts.length + '部品 · ' + state.bayMode.toUpperCase();
  const centerWorld = state.parkedWorld,
    active =
      centerWorld?.vessels.find(v => v.vesselId === centerWorld.activeVesselId) || centerWorld?.vessels[0];
  $('#centerResume', 'button').disabled = !state.centerReady || !active;
  $('#centerFlightInfo', 'p').textContent =
    active && centerWorld
      ? (active.vesselName || centerWorld.flightMeta?.name || '機体') +
        ' · T+ ' +
        active.state.time.toFixed(1) +
        's · ' +
        active.parts.length +
        '部品 · 保持 ' +
        centerWorld.vessels.length +
        '機 · 一時停止中'
      : '進行中の飛行はありません。';
}
export function showCenter() {
  partWindowPanels().designPartWindows.clear();
  if (state.practiceSession) finishPractice();
  else {
    parkFlight();
    if (state.flight) endFlight();
  }
  cancelPlacement();
  $('#orbitOverlay', 'section').hidden = true;
  state.atCenter = true;
  flightPanels().buoyancyPanel.update();
  document.title = 'Omnivehicle · 宇宙センター';
  document.body.classList.add('at-center');
  $('#spaceCenter', 'section').hidden = false;
  keys.clear();
  persistWorkspace();
  refreshCenter();
  state.centerView?.resize();
}
export function enterWorkshop(bay: string) {
  if (!state.centerReady) return;
  state.atCenter = false;
  document.title = 'Omnivehicle · ' + bay.toUpperCase();
  $('#spaceCenter', 'section').hidden = true;
  document.body.classList.remove('at-center');
  setBay(bay);
  keys.clear();
  state.last = performance.now();
  resize();
  frame();
  persistWorkspace();
}
export function resumeFromCenter(selection: {world: SavedWorld; observe: string | null} | null = null) {
  if (!state.parkedWorld?.vessels.length) return;
  const draft = {
    parts: state.parts,
    name: $('#craftName', 'input').value,
    environment: $('#environment', 'select').value,
    bay: state.bayMode
  };
  const record = flightFromWorld(selection?.world || state.parkedWorld);
  enterWorkshop(state.bayMode);
  if (record && restoreFlight(record)) {
    state.parts = draft.parts;
    $('#craftName', 'input').value = draft.name;
    $('#environment', 'select').value = draft.environment;
    state.bayMode = draft.bay;
    state.parkedWorld = selection?.world || state.parkedWorld;
    if (selection?.observe) {
      const resumed = currentFlight(),
        observed = fleet(resumed).find(v => v.vesselId === selection.observe);
      if (!observed) throw Error('観察する機体が見つかりません');
      state.trackedDebris = observed;
      const focus = vesselCenter(observed);
      frameTrackedVessel(sceneCore().controls, focus, bodyUp(focus, resumed.universalTime));
      flightFocus.copy(focus);
    }
    persistWorkspace();
  } else {
    if (!record) notify('再開する機体の記録がありません');
    showCenter();
  }
}
export async function initializeCenter() {
  state.centerReady = true;
  $('#enterVAB', 'button').disabled = false;
  $('#enterSPH', 'button').disabled = false;
  for (const id of ['centerTracking', 'centerPad', 'centerRunway']) $('#' + id, 'button').disabled = false;
  state.centerView = new SpaceCenter(
    $('#centerScene', 'canvas'),
    openCenterFacility,
    highlightCenterFacility
  );
  try {
    await state.centerView.load();
    $('#centerLoading', 'div').hidden = true;
  } catch (e) {
    $('#centerLoading', 'div').textContent = '3D施設を読み込めませんでした。左のボタンから組立棟へ入れます。';
    console.error(e);
  }
  refreshCenter();
}
export function wireCenterButtons() {
  $('#toCenter', 'button').onclick = showCenter;
  $('#enterVAB', 'button').onclick = () => enterWorkshop('vab');
  $('#enterSPH', 'button').onclick = () => enterWorkshop('sph');
  $('#centerResume', 'button').onclick = () => resumeFromCenter();
}
function highlightCenterFacility(id: string | null) {
  const facility = Object.entries(CENTER_FACILITIES).find(([key]) => key === id)?.[1];
  $('#centerFacilityName', 'h2').textContent = facility?.name || '施設を選んで出発';
  $('#centerFacilityDescription', 'p').textContent =
    facility?.description || '建物にポインターを合わせると役割を表示します。';
  for (const [key, item] of Object.entries(CENTER_FACILITIES))
    $('#' + item.button, 'button').classList.toggle('facilityHighlighted', key === id);
}
function openCenterFacility(id: string) {
  if (id === 'vab' || id === 'sph') {
    enterWorkshop(id);
    return;
  }
  if (id === 'tracking') openTracking();
  else if (id === 'pad' || id === 'runway') openLaunchLibrary(id);
}
export function wireCenterFacilities() {
  for (const [id, item] of Object.entries(CENTER_FACILITIES)) {
    const button = $('#' + item.button, 'button');
    button.addEventListener('pointerenter', () => state.centerView?.pointFacility(id));
    button.addEventListener('pointerleave', () => state.centerView?.pointFacility(null));
    button.addEventListener('focus', () => state.centerView?.focusFacility(id));
    button.addEventListener('blur', () => state.centerView?.focusFacility(null));
  }
  $('#centerTracking', 'button').onclick = () => openTracking();
  $('#centerPad', 'button').onclick = () => openLaunchLibrary('pad');
  $('#centerRunway', 'button').onclick = () => openLaunchLibrary('runway');
}

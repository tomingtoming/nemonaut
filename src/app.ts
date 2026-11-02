import './storage-migration.js';
import {watchTouchDevice} from './touch-device.js';
import {mountTouchFlight} from './touch-flight.js';
import {mountFailureLog} from './failure-feedback.js';
import {FailureVisuals} from './failure-visuals.js';
import './orbital-ascent-panel.js'; // keeps the module evaluation order (mounted in flight-panels)
import './runway-panel.js'; // keeps the module evaluation order (mounted in flight-panels)
import './docking-window.js'; // keeps the module evaluation order (mounted in flight-panels)
import './delivery-panel.js'; // keeps the module evaluation order (mounted in flight-panels)
import './overlay-panels.js'; // import-time DOM setup (panel dock); keeps its original evaluation order
import './camera-up.js'; // keeps the module evaluation order
import './practice-session.js'; // keeps the module evaluation order
import {mountThrustOverlay} from './thrust-overlay.js';
import './physics-clock.js'; // keeps the module evaluation order
import './design-library.js'; // keeps the module evaluation order
import {PARTS, preset} from './catalog.js';
import './launch-pilot.js'; // keeps the module evaluation order
import {loadPhysics} from './physics.js';
import {installTranslation, currentLanguage, setLanguage} from './i18n.js';
import {closest} from './dom.js';
import {state} from './app-state.js';
import {wireHooks} from './app-hooks.js';
import {$, errorMessage} from './ui-common.js';
import {
  createRenderer,
  createView,
  createEditorMarkers,
  createSelectionOverlays,
  objects,
  resize,
  frame
} from './scene.js';
import {buildWorkshopBay, updateWorkshop} from './workshop-bay.js';
import {loadAssets} from './asset-loader.js';
import {rebuildCraft} from './part-visuals.js';
import {updateExploration} from './exploration-ui.js';
import {openTracking} from './tracking-recovery.js';
import {saveDesign, openLaunchLibrary} from './design-library-ui.js';
import {checkpoint} from './workshop-undo.js';
import {createWorkshopOverlays, renderInterferences} from './workshop-panels.js';
import {cancelPlacement, pointer, hitPart, wirePlacement} from './workshop-place.js';
import {select, wireSelection} from './workshop-select.js';
import {loadData, setBay, wireWorkshopToolbar, catalog, wireCatalog} from './workshop-toolbar.js';
import {initDockingUi, wireDockingPorts, updateDocking} from './docking-ui.js';
import {mountOrbitMapPanels, wireOrbitMapControls} from './orbit-map-ui.js';
import {keys, mountFlightAudio, gameAudio} from './flight-shared.js';
import {mountPartWindowPanels, mountFlightPanels, flightPanels} from './flight-panels.js';
import {updateInfo} from './info-hub.js';
import {mountWarpGuard, updateDebrisList, wireFlightHud, updateNavigation} from './flight-hud.js';
import {
  startFlight,
  syncFlightControls,
  switchVessel,
  endFlight,
  stage,
  refreshDockedFlight
} from './flight-lifecycle.js';
import {wireFlightControls} from './flight-controls-ui.js';
import {persistWorkspace, restoreWorkspace, wireWorkspacePersistence} from './workspace-ui.js';
import {wireQuickSave} from './quick-save.js';
import {launchAdditional, wireLaunchButtons} from './launch-ui.js';
import {
  refreshCenter,
  showCenter,
  enterWorkshop,
  resumeFromCenter,
  initializeCenter,
  wireCenterButtons,
  wireCenterFacilities
} from './center-ui.js';
import {wireKeyboard, wireCameraKeys} from './keyboard-input.js';
import {startFrameLoop} from './frame-loop.js';
wireHooks({
  updateInfo,
  syncFlightControls,
  switchVessel,
  startFlight,
  endFlight,
  stage,
  refreshDockedFlight,
  updateDocking,
  updateNavigation,
  updateDebrisList,
  updateExploration,
  showCenter,
  refreshCenter,
  enterWorkshop,
  resumeFromCenter,
  openTracking,
  persistWorkspace,
  launchAdditional,
  rebuild,
  select,
  cancelPlacement,
  checkpoint,
  setBay,
  loadData,
  frame,
  updateWorkshop,
  renderInterferences
});
// Touch devices get body.touch (touch controls and layout); a mouse keeps the desktop layout.
watchTouchDevice();
mountTouchFlight($('#flightHud', 'div'));
// English display rewrites text through dist/i18n/en.json; Japanese changes nothing.
await installTranslation();
for (const id of ['language', 'centerLanguage']) {
  const b = document.getElementById(id);
  if (!b) continue;
  const english = currentLanguage() === 'en';
  b.textContent = english ? 'JA' : 'EN';
  b.title = english ? '日本語で表示' : 'Show in English';
  b.onclick = () => setLanguage(english ? 'ja' : 'en');
}
// Physics runs on the Rust Wasm engine only. If it cannot load, stop with a visible error
// instead of falling back to the retired JS solver.
try {
  await loadPhysics();
  document.documentElement.dataset.physics = 'rust';
} catch (error) {
  const notice = document.createElement('div');
  notice.setAttribute('role', 'alert');
  notice.style.cssText =
    'position:fixed;inset:auto 8px 8px 8px;z-index:1000;padding:8px 12px;border-radius:4px;font:14px system-ui;background:#5a1e1e;color:#fff';
  notice.textContent = '物理エンジン（Rust Wasm）を読み込めません: ' + errorMessage(error);
  document.body.append(notice);
  throw error;
}
addEventListener('error', e => {
  if (String(e.message).includes('Rust物理')) {
    const notice = document.createElement('div');
    notice.setAttribute('role', 'alert');
    notice.style.cssText =
      'position:fixed;inset:auto 8px 8px 8px;z-index:1000;padding:8px 12px;border-radius:4px;font:14px system-ui;background:#5a1e1e;color:#fff';
    notice.textContent = e.message;
    document.body.append(notice);
  }
});
mountWarpGuard();
const canvas = $('#scene', 'canvas'),
  viewport = $('#viewport', 'section');
const {scene} = createRenderer(canvas);
const failureVisuals = new FailureVisuals(scene);
createView(viewport);
const thrustOverlay = mountThrustOverlay(scene);
buildWorkshopBay();
const {gizmo} = createEditorMarkers();
state.parts = preset('rocket');
createWorkshopOverlays();
function rebuild() {
  rebuildCraft();
  if (state.selected && !objects.has(state.selected)) state.selected = null;
  select(state.selected);
  updateInfo();
  renderInterferences();
  updateWorkshop();
}
createSelectionOverlays();
wireSelection();
wirePlacement();
const {partWindows, designPartWindows} = mountPartWindowPanels();
canvas.addEventListener('pointerup', e => {
  if (
    state.atCenter ||
    e.button !== 2 ||
    !state.pointerDown ||
    state.placing ||
    state.movingBranch ||
    state.pointerDown.wasGizmo ||
    gizmo.dragging ||
    Math.hypot(e.clientX - state.pointerDown.x, e.clientY - state.pointerDown.y) > 5
  )
    return;
  pointer(e);
  const hit = hitPart();
  if (hit) (state.flight ? partWindows : designPartWindows).open(hit.id, e.clientX, e.clientY);
});
wireFlightHud();
$('.close', 'button').onclick = () => $('#modal', 'dialog').close();
$('#modal', 'dialog').addEventListener('click', e => {
  if (e.target === $('#modal', 'dialog')) $('#modal', 'dialog').close();
});
wireWorkshopToolbar();
mountOrbitMapPanels(() => {
  maneuverPanel.stop();
  orbitalPanel.stop();
});
wireOrbitMapControls();

wireFlightControls();
wireQuickSave();
wireLaunchButtons();
wireKeyboard();
initDockingUi({keys, gameAudio, dockingWindow: () => flightPanels().dockingWindow});
wireCameraKeys();
new ResizeObserver(resize).observe(viewport);
const failureLog = mountFailureLog(closest($('#flightStatus', 'span'), '.hudtop', 'div'));
state.last = performance.now();
mountFlightAudio();
startFrameLoop(failureVisuals, failureLog);
wireCatalog();
async function boot() {
  try {
    $('#catalogCount', 'span').textContent = String(Object.keys(PARTS).length);
    await loadAssets();
    catalog();
    restoreWorkspace();
    rebuild();
    frame();
    $('#loading', 'div').hidden = true;
    await initializeCenter();
  } catch (e) {
    console.error(e);
    $('#loading', 'div').innerHTML =
      '<strong>部品を読み込めませんでした</strong><span>ページを再読み込みしてください。</span>';
  }
}
boot();

wireDockingPorts();

wireCenterButtons();
wireWorkspacePersistence();

$('#save', 'button').onclick = saveDesign;
wireCenterFacilities();

$('#load', 'button').onclick = () => {
  if (!state.flight) openLaunchLibrary('workshop');
};

const {maneuverPanel, orbitalPanel} = mountFlightPanels(thrustOverlay);

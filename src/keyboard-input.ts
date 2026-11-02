// Keyboard input (BACKLOG 7c, moved from app.ts unchanged): the main flight/workshop key handler with quick
// save/load, and the arrow keys that orbit the camera. No import-time side effects except creating the held
// arrow set; app.ts calls wireKeyboard and wireCameraKeys at the original places (the docking autopilot's
// capture listener is registered between them by initDockingUi).
import {acceptsFlightKey} from './flight-keyboard.js';
import {canControl} from './fleet.js';
import {state} from './app-state.js';
import {$} from './ui-common.js';
import {frame} from './scene.js';
import {undo, redo} from './workshop-undo.js';
import {cancelPlacement} from './workshop-place.js';
import {setMode, deleteSelected} from './workshop-select.js';
import {applySnap, workshopSymmetry} from './workshop-toolbar.js';
import {toggleOrbitMap} from './orbit-map-ui.js';
import {keys} from './flight-shared.js';
import {flightPanels} from './flight-panels.js';
import {syncFlightControls, stage} from './flight-lifecycle.js';
import {quickSave, quickLoad} from './quick-save.js';
export function wireKeyboard() {
  window.addEventListener('keydown', e => {
    if (state.atCenter) return;
    if (state.flight && ['F5', 'F9'].includes(e.code)) {
      e.preventDefault();
      if (!e.repeat) (e.code === 'F5' ? quickSave : quickLoad)();
      return;
    }
    if (
      (state.flight
        ? !acceptsFlightKey(e.target, e.code)
        : e.target instanceof Element && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) ||
      $('#modal', 'dialog').open
    )
      return;
    if (state.flight && e.code === 'KeyF') {
      e.preventDefault();
      if (!e.repeat) frame();
      return;
    }
    if (state.flight && e.code === 'KeyP' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (!e.repeat) flightPanels().flightPause.toggle();
      return;
    }
    if (state.flight && e.code === 'KeyM') {
      if (!e.repeat) toggleOrbitMap();
      return;
    }
    if (e.code === 'Escape' && !$('#orbitOverlay', 'section').hidden) {
      $('#orbitOverlay', 'section').hidden = true;
      return;
    }
    if (state.flight && e.code === 'CapsLock' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (!e.repeat) $('#precisionControl', 'button').click();
      return;
    }
    if (state.flight && flightPanels().flightPause.paused) return;
    if (
      state.flight &&
      (!canControl(state.flight) ||
        ((e.ctrlKey || e.metaKey || e.altKey) && !['ControlLeft', 'ControlRight'].includes(e.code)))
    )
      return;
    keys.add(e.code);
    if (['Space', 'Delete', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (state.flight) {
      if (e.code === 'KeyR') $('#rcsEnabled', 'input').click();
      if (e.code === 'KeyH') state.flight.armParachutes();
      if (e.code === 'Space') stage();
      if (e.code === 'KeyB') $('#brake', 'button').click();
      if (e.code === 'KeyT') $('#sas', 'button').click();
      if (e.code === 'KeyX' || e.code === 'KeyZ') {
        state.launchPilot = null;
        $('#autoLaunch', 'button').textContent = '自動軌道投入（見本用）';
        state.flight.throttle = e.code === 'KeyZ' ? 1 : 0;
        syncFlightControls();
      }
      return;
    }
    if (e.ctrlKey && e.code === 'KeyZ') {
      e.preventDefault();
      undo();
    } else if (e.ctrlKey && e.code === 'KeyY') {
      e.preventDefault();
      redo();
    } else if (e.code === 'Escape') {
      cancelPlacement();
      setMode('select');
    } else if (e.code === 'KeyG') setMode('translate');
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'KeyR') workshopSymmetry().toggle();
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'KeyX') workshopSymmetry().cycle(e.shiftKey);
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'KeyC') {
      $('#snap', 'input').checked = !$('#snap', 'input').checked;
      applySnap();
    } else if (e.code === 'KeyE') setMode('rotate');
    else if (e.code === 'KeyF') frame();
    else if (e.code === 'Delete') deleteSelected();
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
}
// Arrow keys orbit the camera in the workshop and in flight, also for wrecks and while paused.
// The space center keeps arrows for facility selection; form fields and sliders keep theirs.
export const cameraKeys = new Set();
export function wireCameraKeys() {
  window.addEventListener('keydown', e => {
    if (
      state.atCenter ||
      !e.code.startsWith('Arrow') ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      $('#modal', 'dialog').open ||
      !acceptsFlightKey(e.target, e.code)
    )
      return;
    e.preventDefault();
    cameraKeys.add(e.code);
  });
  window.addEventListener('keyup', e => cameraKeys.delete(e.code));
  window.addEventListener('blur', () => cameraKeys.clear());
}

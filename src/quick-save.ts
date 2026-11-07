import {showBrakeState} from './flight-controls.js';
// Quick save and restore of the current flight (BACKLOG 7c, moved from app.ts unchanged): the practice
// session's temporary save, the browser save slot, and restoring a saved flight with its controls and
// autopilot. No import-time side effects (the storage key is a constant string); app.ts calls wireQuickSave.
import {storageKey} from './app-id.js';
import {needsPhysicsMigration, physicsMigrationMessage} from './physics-migration.js';
import {worldFromFlight} from './world-save.js';
import {saveFlight, loadFlight, type SavedFlight} from './flight-save.js';
import {ReturnPilot} from './return-pilot.js';
import {LaunchPilot} from './launch-pilot.js';
import {state} from './app-state.js';
import {hooks} from './app-hooks.js';
import {$, errorMessage, notify} from './ui-common.js';
import {currentFlight} from './current-flight.js';
import {updateExploration} from './exploration-ui.js';
import {flightPanels} from './flight-panels.js';
import {startFlight, endFlight} from './flight-lifecycle.js';
import {flightRecord} from './workspace-ui.js';
const flightSaveKey = storageKey('flight-v1');
export function quickSave() {
  if (!state.flight) return;
  try {
    updateExploration();
    if (state.practiceSession) {
      state.practiceSession.saveFlight(flightRecord());
      notify('練習中の飛行を一時保存しました。練習終了・再読込で破棄されます。');
      return;
    }
    const pilot = state.launchPilot
      ? {
          kind: state.launchPilot instanceof ReturnPilot ? 'return' : 'launch',
          done: state.launchPilot.done,
          released: !!state.launchPilot.released
        }
      : null;
    localStorage.setItem(
      flightSaveKey,
      JSON.stringify(
        saveFlight(state.flight, {
          name: state.flight.vesselName || state.activeFlightName || $('#craftName', 'input').value,
          pilot,
          worldHistory: state.parkedWorld?.history ?? []
        })
      )
    );
    notify('飛行を保存しました · T+ ' + state.flight.time.toFixed(1) + 's');
  } catch (e) {
    notify('飛行を保存できませんでした：' + errorMessage(e));
  }
}
export function quickLoad() {
  try {
    if (state.practiceSession) {
      restoreFlight(state.practiceSession.loadFlight());
      return;
    }
    const raw = localStorage.getItem(flightSaveKey);
    if (!raw) throw Error('保存された飛行がありません');
    if (raw.length > 2000000) throw Error('保存データが大きすぎます');
    const data = JSON.parse(raw);
    if (needsPhysicsMigration(data))
      localStorage.setItem(flightSaveKey + '-before-rotation-' + Date.now(), raw);
    restoreFlight(data);
  } catch (e) {
    notify(errorMessage(e));
  }
}
function isSavedPilot(
  value: unknown
): value is {kind: 'return' | 'launch'; done: boolean; released: boolean} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value.kind === 'return' || value.kind === 'launch') &&
    'done' in value &&
    typeof value.done === 'boolean' &&
    'released' in value &&
    typeof value.released === 'boolean'
  );
}
export function restoreFlight(data: SavedFlight) {
  const draft = {
    parts: state.parts,
    name: $('#craftName', 'input').value,
    environment: $('#environment', 'select').value,
    bay: state.bayMode
  };
  let restored;
  try {
    const rawPilot = data.meta?.pilot,
      pilot = isSavedPilot(rawPilot) ? rawPilot : undefined;
    if (rawPilot && !pilot) throw Error('自動実演の保存形式が不正です');
    const restoredWorld = worldFromFlight(data);
    restored = loadFlight(data);
    if (state.flight) endFlight();
    state.parkedWorld = restoredWorld;
    state.parts = structuredClone(restored.parts);
    $('#craftName', 'input').value =
      typeof data.meta?.name === 'string' ? data.meta.name.slice(0, 80) : 'Restored flight';
    $('#environment', 'select').value = restored.environment;
    hooks.rebuild();
    startFlight(restored);
    const restoredFlight = currentFlight();
    state.activeFlightName = restoredFlight.vesselName || $('#craftName', 'input').value;
    state.parts = draft.parts;
    $('#craftName', 'input').value = draft.name;
    $('#environment', 'select').value = draft.environment;
    state.bayMode = draft.bay;
    for (const k of ['reactionEnabled', 'steeringEnabled', 'driveEnabled', 'rcsEnabled'] as const)
      $('#' + k, 'input').checked = restoredFlight[k];
    $('#throttle', 'input').value = String(restoredFlight.throttle * 100);
    $('#ballast', 'input').value = String(restoredFlight.ballast * 100);
    $('#trim', 'input').value = String(restoredFlight.trim * 100);
    $('#trimVal', 'b').textContent = Math.round(restoredFlight.trim * 100) + '%';
    $('#sas', 'button').textContent = 'SAS ' + (restoredFlight.sas ? 'ON' : 'OFF');
    $('#sas', 'button').classList.toggle('active', restoredFlight.sas);
    showBrakeState($('#brake', 'button'), restoredFlight.brake);
    if (pilot) {
      state.launchPilot = pilot.kind === 'return' ? new ReturnPilot() : new LaunchPilot();
      state.launchPilot.done = pilot.done;
      state.launchPilot.released = pilot.released;
      $('#autoLaunch', 'button').textContent = '自動実演を解除';
    }
    if (restoredFlight.physicsMigration)
      $('#centerNotice', 'p').textContent = physicsMigrationMessage(restoredFlight.physicsMigration);
    flightPanels().flightPause.set(true);
    notify(
      physicsMigrationMessage(restoredFlight.physicsMigration) ||
        '飛行を復元しました · 一時停止 · T+ ' + restoredFlight.time.toFixed(1) + 's'
    );
    return true;
  } catch (e) {
    if (restored && restored !== state.flight) restored.dispose();
    notify(errorMessage(e));
    return false;
  }
}
export function wireQuickSave() {
  $('#quickSave', 'button').onclick = quickSave;
  $('#quickLoad', 'button').onclick = quickLoad;
  $('#resumeFlight', 'button').onclick = quickLoad;
}

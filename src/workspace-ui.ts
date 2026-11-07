// Workspace persistence (BACKLOG 7c, moved from app.ts unchanged): the record of the current flight, parking
// the flight into the saved world, writing and restoring the workspace (world + workshop draft) in browser
// storage, and saving it before the page unloads. No import-time side effects; app.ts calls
// wireWorkspacePersistence at the original place.
import {ReturnPilot} from './return-pilot.js';
import {saveFlight} from './flight-save.js';
import {editingParts, gameRecord} from './game-save.js';
import {worldFromFlight, flightFromWorld} from './world-save.js';
import {readStoredGame, writeStoredGame, backupStoredGame} from './game-storage.js';
import {physicsMigrationMessage} from './physics-migration.js';
import {updateDepartureButton} from './departure-mode.js';
import {state} from './app-state.js';
import {$, errorMessage} from './ui-common.js';
import {currentFlight} from './current-flight.js';
import {updateExploration} from './exploration-ui.js';
import {setBay} from './workshop-toolbar.js';
import {keys, physicsClock} from './flight-shared.js';
import {flightPanels} from './flight-panels.js';
export function flightRecord() {
  updateExploration();
  const recorded = currentFlight(),
    pilot = state.launchPilot
      ? {
          kind: state.launchPilot instanceof ReturnPilot ? 'return' : 'launch',
          done: state.launchPilot.done,
          released: !!state.launchPilot.released
        }
      : null;
  return saveFlight(recorded, {
    name: recorded.vesselName || state.activeFlightName || $('#craftName', 'input').value,
    pilot,
    worldHistory: state.parkedWorld?.history ?? []
  });
}
export function parkFlight() {
  flightPanels().cruisePanel.stop();
  if (state.flight) {
    state.universalTime = state.flight.universalTime;
    state.parkedWorld = worldFromFlight(flightRecord());
  }
  keys.clear();
  physicsClock.reset();
}
export function persistWorkspace() {
  if (state.workspaceError) return false;
  try {
    if (state.practiceSession) {
      state.practiceSession.saveHome(localStorage);
      return true;
    }
    const world = state.flight
      ? worldFromFlight(flightRecord())
      : (state.parkedWorld ?? worldFromFlight(null, {universalTime: state.universalTime}));
    writeStoredGame(
      localStorage,
      gameRecord({
        world,
        draft: {
          parts: state.parts,
          name: $('#craftName', 'input').value,
          bay: state.bayMode,
          environment: $('#environment', 'select').value
        }
      })
    );
    return true;
  } catch (e) {
    $('#centerNotice', 'p').textContent =
      'ブラウザへの保存に失敗しました。ページを閉じず、機体JSON出力・飛行保存を確認してください。';
    return false;
  }
}
export function restoreWorkspace() {
  try {
    const saved = readStoredGame(localStorage);
    if (!saved) return;
    const {game, migrated} = saved,
      w = game.workshop,
      record = flightFromWorld(game.world),
      notices = [];
    if (migrated)
      notices.push(
        '旧保存を読み込みました。次の自動保存から世界と設計を分けて記録します。旧保存はブラウザ内に残します。'
      );
    if (record?.physicsMigration) notices.push(physicsMigrationMessage(record.physicsMigration));
    $('#centerNotice', 'p').textContent = notices.join(' ');
    state.universalTime = game.world.universalTime;
    state.parts = editingParts(game);
    $('#craftName', 'input').value = w.name;
    setBay(w.bay);
    $('#environment', 'select').value = w.environment;
    updateDepartureButton(document, w.environment);
    state.parkedWorld = game.world;
  } catch (e) {
    state.workspaceError = true;
    $('#centerNotice', 'p').textContent =
      '保存を復元できませんでした。元データを残して自動保存を停止しています。' + errorMessage(e);
    const reset = document.createElement('button');
    reset.textContent = '元データを退避して新しく始める';
    reset.onclick = () => {
      try {
        backupStoredGame(localStorage);
        state.workspaceError = false;
        if (!persistWorkspace()) {
          state.workspaceError = true;
          throw Error('新しい保存を作成できませんでした');
        }
        $('#centerNotice', 'p').textContent = '以前の保存をブラウザ内のバックアップへ退避しました。';
        reset.remove();
      } catch {
        state.workspaceError = true;
        reset.textContent = '退避または保存に失敗しました。保存容量を確認してください';
      }
    };
    $('#centerNotice', 'p').after(reset);
  }
}
export function wireWorkspacePersistence() {
  window.addEventListener('beforeunload', () => {
    if (state.centerReady) persistWorkspace();
  });
}

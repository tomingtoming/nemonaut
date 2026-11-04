// Launch and practice (BACKLOG 7c, moved from app.ts unchanged): launching the workshop craft or a library
// design into the saved world or into an independent practice session, finishing practice, and the
// launch/back buttons. Calls the space center through app-hooks (center-ui imports this module).
// No import-time side effects; app.ts calls wireLaunchButtons.
import {Flight} from './core.js';
import {loadFlight} from './flight-save.js';
import {PracticeSession, type PracticeDesign} from './practice-session.js';
import {departureMode, historyActionLabel} from './departure-mode.js';
import {launchWorld} from './world-operations.js';
import {fleet} from './fleet.js';
import {launchHint} from './vessel-controls.js';
import {gameRecord} from './game-save.js';
import {worldFromFlight, flightFromWorld} from './world-save.js';
import type {LaunchSiteError} from './launch-clearance.js';
import {state} from './app-state.js';
import {hooks} from './app-hooks.js';
import {$, errorMessage, notify, showModal} from './ui-common.js';
import {currentFlight} from './current-flight.js';
import {frame} from './scene.js';
import {openTracking} from './tracking-recovery.js';
import {select} from './workshop-select.js';
import {setBay} from './workshop-toolbar.js';
import {keys, physicsClock} from './flight-shared.js';
import {updateInfo} from './info-hub.js';
import {startFlight, endFlight} from './flight-lifecycle.js';
import {parkFlight, persistWorkspace} from './workspace-ui.js';
export function requestLaunch() {
  launchAdditional({
    parts: state.parts,
    name: $('#craftName', 'input').value,
    environment: $('#environment', 'select').value,
    bay: state.bayMode,
    ...($('#environment', 'select').value === 'orbit' && $('#targetPractice', 'select').value
      ? {practiceScenario: $('#targetPractice', 'select').value}
      : {})
  });
}
export function finishPractice() {
  if (!state.practiceSession) return;
  const home = state.practiceSession.home;
  if (state.flight) endFlight();
  state.practiceSession = null;
  state.parkedWorld = home.world;
  state.universalTime = home.world.universalTime;
  state.parts = home.workshop.parts;
  $('#craftName', 'input').value = home.workshop.name;
  setBay(home.workshop.bay);
  $('#environment', 'select').value = home.workshop.environment;
  keys.clear();
  physicsClock.reset();
  hooks.rebuild();
  frame();
  updateInfo();
  notify('練習を終了しました。通常世界の機体・時刻・設計に戻りました。');
}
function isLaunchSiteError(e: unknown): e is LaunchSiteError {
  return e instanceof Error && (!('blockers' in e) || e.blockers === undefined || Array.isArray(e.blockers));
}
export function launchAdditional(design: PracticeDesign & {bay?: string}) {
  if (state.flight || state.practiceSession) {
    notify('現在の飛行を終了してから出発してください');
    return;
  }
  let next: Flight | null = null,
    candidate: PracticeSession | null = null;
  const draft = {
    parts: state.parts,
    name: $('#craftName', 'input').value,
    environment: $('#environment', 'select').value,
    bay: state.bayMode
  };
  try {
    const home = gameRecord({
      world: state.parkedWorld ?? worldFromFlight(null, {universalTime: state.universalTime}),
      draft
    });
    const practice = departureMode(design.environment).mode === 'practice';
    if (practice) {
      if (state.workspaceError) throw Error('通常世界の保存エラーを解消してから練習を開始してください');
      candidate = new PracticeSession(home, design);
      candidate.saveHome(localStorage);
    }
    const launchedWorld = candidate ? candidate.initialWorld : launchWorld(home.world, design);
    const launchedRecord = flightFromWorld(launchedWorld);
    if (!launchedRecord) throw Error('出発した機体の記録がありません');
    next = loadFlight(launchedRecord);
    state.launchPartOrigins = new Map(next.parts.map((p, i) => [p.id, design.parts[i]?.id]));
    state.practiceSession = candidate;
    $('#modal', 'dialog').close();
    hooks.enterWorkshop(design.bay || state.bayMode);
    state.parts = structuredClone(next.parts);
    $('#craftName', 'input').value = next.vesselName;
    $('#environment', 'select').value = next.environment;
    hooks.rebuild();
    startFlight(next);
    state.activeFlightName = next.vesselName;
    state.parkedWorld = launchedWorld;
    state.parts = draft.parts;
    $('#craftName', 'input').value = draft.name;
    $('#environment', 'select').value = draft.environment;
    state.bayMode = draft.bay;
    persistWorkspace();
    if (practice) notify('独立した練習を開始しました。通常世界は停止・保持されています。');
    else {
      const departure = launchedWorld.history.at(-1);
      if (!departure) throw Error('出発の記録がありません');
      // How this craft starts, from its parts (BACKLOG 9a); the full list is in the controls panel.
      const hint = launchHint(currentFlight().parts, document.body.classList.contains('touch'));
      notify(
        historyActionLabel(departure) +
          ' · 他の機体 ' +
          (fleet(currentFlight()).length - 1) +
          '機を保持' +
          (hint ? ' · ' + hint : '')
      );
    }
  } catch (e) {
    if (state.practiceSession) {
      if (next === state.flight) next = null;
      finishPractice();
    }
    if (next && next !== state.flight) next.dispose();
    state.parts = draft.parts;
    $('#craftName', 'input').value = draft.name;
    $('#environment', 'select').value = draft.environment;
    state.bayMode = draft.bay;
    notify(errorMessage(e));
    if (isLaunchSiteError(e) && e.code === 'launch_site_occupied') {
      const blockers = e.blockers;
      if (!blockers) throw Error('出発地点を使用中の機体が分かりません');
      showModal('<h2>出発地点を使用中</h2><div id="launchBlockers"></div>');
      for (const item of blockers) {
        const row = document.createElement('article'),
          name = document.createElement('strong'),
          button = document.createElement('button');
        row.className = 'facilityRow';
        name.textContent = item.name;
        button.textContent = '追跡施設で確認';
        button.onclick = () => {
          hooks.showCenter();
          openTracking(item.id);
        };
        row.append(name, button);
        $('#launchBlockers', 'div').append(row);
      }
      return;
    }
    if ($('#modal', 'dialog').open) {
      const message = document.createElement('p');
      message.textContent = errorMessage(e);
      $('#modalBody', 'div').append(message);
    }
  }
}
export function wireLaunchButtons() {
  $('#launch', 'button').onclick = requestLaunch;
  $('#back', 'button').onclick = () => {
    const damaged = state.launchPartOrigins.get(state.flight?.failureEvents?.at(-1)?.partId);
    if (state.practiceSession) finishPractice();
    else {
      parkFlight();
      endFlight();
    }
    if (damaged && state.parts.some(p => p.id === damaged)) select(damaged);
    persistWorkspace();
  };
}

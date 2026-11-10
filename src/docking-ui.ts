// Docking UI (BACKLOG 7c, moved from app.ts unchanged): the docking panel with port selection, guidance,
// bond release, armed docking and the automatic docking pilot, which a piloting key cancels. app.ts calls
// initDockingUi and wireDockingPorts at their original places. Calls up into app.ts through app-hooks. The
// pilot object is plain state; no import-time side effects on the DOM.
import {DockingAutopilot} from './docking-autopilot.js';
import {acceptsFlightKey} from './flight-keyboard.js';
import {selectDockingPorts} from './relative-navigation.js';
import {drawPortScope} from './port-scope.js';
import {portGuidance} from './port-navigation.js';
import {dockingStatus, dockVessels, undockVessel} from './docking.js';
import {canControl} from './fleet.js';
import {PARTS} from './catalog.js';
import type {FlightPart} from './core.js';
import type {GameAudio} from './game-audio.js';
import type {DockingWindow} from './docking-window.js';
import {state} from './app-state.js';
import {hooks} from './app-hooks.js';
import {$, blurActive, errorMessage, notify} from './ui-common.js';
import {currentFlight} from './current-flight.js';
import {signatureChanged} from './dom.js';
/** What the docking UI uses from app.ts: the held flight keys and the audio and docking window, which are created later. */
export type DockingUiDeps = {
  keys: Set<string>;
  gameAudio: () => GameAudio;
  dockingWindow: () => DockingWindow;
};
let deps: DockingUiDeps | null = null;
function uses(): DockingUiDeps {
  if (!deps) throw Error('ドッキング画面がまだ準備されていません');
  return deps;
}
// Automatic docking (docking panel). A piloting key cancels it the moment it is pressed, even a
// tap shorter than a physics step; camera, map, pause and view keys do not.
export const dockingPilot = new DockingAutopilot();
const PILOT_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyI',
  'KeyK',
  'KeyJ',
  'KeyL',
  'KeyU',
  'KeyO',
  'KeyZ',
  'KeyX',
  'KeyC',
  'KeyR',
  'KeyT',
  'KeyB',
  'KeyH',
  'Space',
  'ShiftLeft',
  'ShiftRight'
]);
export function initDockingUi(uses: DockingUiDeps) {
  deps = uses;
  window.addEventListener(
    'keydown',
    e => {
      if (
        !dockingPilot.active ||
        !PILOT_KEYS.has(e.code) ||
        !state.flight ||
        !acceptsFlightKey(e.target, e.code) ||
        $('#modal', 'dialog').open
      )
        return;
      dockingPilot.stop('cancelled', '手動操作で中止');
      state.dockingArmed = null;
      notify('自動ドッキング：手動操作で中止しました');
    },
    true
  );
}
function portOptions(select: HTMLSelectElement, parts: FlightPart[], chosen: string | null | undefined) {
  const ids = parts.map(p => p.id).join('|');
  if (select.dataset.ids !== ids) {
    select.replaceChildren(
      ...parts.map((p, i) => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = 'DP-12 #' + (i + 1) + ' · ' + p.p.map(n => n.toFixed(1)).join(',');
        return o;
      })
    );
    select.dataset.ids = ids;
  }
  if (typeof chosen === 'string' && parts.some(p => p.id === chosen)) select.value = chosen;
  return select.value;
}
export function updateDocking() {
  const panel = $('#dockingPanel', 'details');
  const docked = state.flight;
  panel.hidden = !docked || !canControl(docked);
  if (!docked || panel.hidden) {
    state.dockingArmed = null;
    return;
  }
  const bonds = $('#dockBonds', 'div'),
    bonded = docked.parts.filter(p => p.dockPartner && p.parent === p.dockPartner).map(p => p.id);
  // One undock button per bond, rebuilt only when the bonds change.
  if (signatureChanged(bonds, bonded.join('|')) || bonds.childElementCount !== bonded.length)
    bonds.replaceChildren(
      ...bonded.map(id => {
        const button = document.createElement('button');
        button.textContent = '結合ポートを分離';
        button.onclick = () => {
          try {
            hooks.refreshDockedFlight(undockVessel(currentFlight(), id));
            uses().gameAudio().play('stage');
            notify('再分離しました。相手機体を目標に指定できます。');
          } catch (e) {
            notify(errorMessage(e));
          }
        };
        return button;
      })
    );
  const target = docked.navigationTarget,
    own = docked.parts.filter(p => PARTS[p.type].docking && !p.dockPartner),
    other = target?.parts.filter(p => PARTS[p.type].docking && !p.dockPartner) || [];
  const ownId = portOptions($('#ownPort', 'select'), own, docked.dockingPorts?.own),
    targetId = portOptions($('#targetPort', 'select'), other, docked.dockingPorts?.target);
  selectDockingPorts(docked, ownId && targetId ? ownId : null, ownId && targetId ? targetId : null);
  const guide = docked.dockingPorts ? portGuidance(docked, ownId, target, targetId) : null,
    status = guide && target ? dockingStatus(docked, ownId, target, targetId) : null;
  uses().dockingWindow().readings(guide, status);
  $('#portGuide', 'div').hidden = !guide;
  $('#portFrame', 'input').checked = docked.portTranslationEnabled;
  // The docking autopilot switches RCS on and back; the switch follows the vessel.
  $('#rcsEnabled', 'input').checked = docked.rcsEnabled;
  if (guide) {
    $('#portReadings', 'small').textContent =
      '軸距離 ' + guide.axial.toFixed(2) + ' m · 接近 ' + guide.closing.toFixed(2) + ' m/s';
    drawPortScope($('#portCrosshair', 'canvas'), guide);
  }
  $('#dockStatus', 'small').textContent = status
    ? status.ready
      ? '結合できます'
      : status.reason
    : target
      ? '双方に空きポートが必要です'
      : '他の機体を目標に指定してください';
  if (
    state.dockingArmed &&
    (state.dockingArmed.flight !== state.flight ||
      state.dockingArmed.own !== ownId ||
      state.dockingArmed.target !== targetId)
  )
    state.dockingArmed = null;
  const connect = () => {
    state.dockingArmed = null;
    try {
      const live = currentFlight();
      if (!target) throw Error('目標の機体がありません');
      hooks.refreshDockedFlight(dockVessels(live, target, ownId, targetId));
      uses().gameAudio().play('dock');
      notify('ドッキング完了。1機として操縦できます。');
    } catch (e) {
      notify(errorMessage(e));
    }
  };
  $('#dockButton', 'button').disabled = !guide;
  $('#autoDock', 'button').disabled = !guide && !dockingPilot.active;
  $('#autoDock', 'button').textContent = dockingPilot.active ? '自動ドッキングを中止' : '自動ドッキング';
  $('#autoDockStatus', 'small').textContent =
    dockingPilot.state === 'idle' ? '' : '自動ドッキング：' + dockingPilot.message;
  $('#autoDock', 'button').onclick = () => {
    if (dockingPilot.active) {
      dockingPilot.stop('cancelled', '中止しました');
      state.dockingArmed = null;
      return;
    }
    try {
      dockingPilot.start(state.flight);
      state.dockingArmed = {flight: state.flight, own: ownId, target: targetId};
      notify('自動ドッキング開始：整列→回り込み→待機点→最終接近の順に進みます。操縦キーで中止。');
    } catch (e) {
      notify(errorMessage(e));
    }
  };
  $('#dockButton', 'button').textContent = state.dockingArmed
    ? '結合待機を解除'
    : status?.ready
      ? '目標と結合'
      : '結合待機（接近は手動）';
  $('#dockButton', 'button').onclick = () => {
    if (!guide || !status) return;
    if (state.dockingArmed) {
      state.dockingArmed = null;
      return;
    }
    if (status.ready) {
      connect();
      return;
    }
    state.dockingArmed = {flight: state.flight, own: ownId, target: targetId};
    notify('結合待機：条件がそろうと結合します。接近と減速は手動です。');
  };
  if (state.dockingArmed && status?.ready) connect();
}
export function wireDockingPorts() {
  const {keys} = uses();
  $('#portPower', 'select').onchange = () => {
    keys.clear();
    $('#portPower', 'select').blur();
  };
  for (const id of ['ownPort', 'targetPort'])
    $('#' + id, 'select').onchange = () => {
      if (state.flight) {
        keys.clear();
        state.dockingArmed = null;
        selectDockingPorts(state.flight, $('#ownPort', 'select').value, $('#targetPort', 'select').value);
      }
      blurActive();
    };
  $('#portFrame', 'input').onchange = () => {
    const portFrame = $('#portFrame', 'input');
    if (state.flight) state.flight.portTranslationEnabled = portFrame.checked && !!state.flight.dockingPorts;
    portFrame.blur();
  };
  $('#alignDock', 'button').onclick = () => {
    if (!state.flight?.dockingPorts) return;
    state.flight.sasMode = 'dock';
    state.flight.sas = true;
    state.flight.holdQ = state.flight.q.clone();
    $('#sas', 'button').textContent = 'SAS ON';
    $('#sas', 'button').classList.add('active');
    blurActive();
  };
}

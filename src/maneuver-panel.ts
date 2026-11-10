import {PARTS} from './catalog.js';
import {canControl} from './fleet.js';
import {ManeuverSession} from './maneuver-session.js';
import {maneuverWarpBudget} from './maneuver-warp.js';
import {floatingWindow, type FloatingWindow} from './floating-window.js';
import {acceptsFlightKey} from './flight-keyboard.js';
import {preserveManualControlEdit, isControlTarget} from './manual-control-edit.js';
import {element, missing} from './dom.js';
import type {Flight} from './core.js';
import type {ManeuverNodeRecord} from './maneuver-node.js';

export type ManeuverPanelFlight = Flight;
interface ManeuverWindow {
  panel: FloatingWindow;
  power: HTMLSelectElement;
  timing: HTMLSelectElement;
  start: HTMLButtonElement;
  status: HTMLOutputElement;
  readout: HTMLParagraphElement;
}
export interface ManeuverPanelState {
  flight: ManeuverPanelFlight | null | undefined;
  atCenter: boolean;
}
export interface ManeuverPanelHooks {
  claim(): void;
  sync(): void;
}
export interface ManeuverPanel {
  update(): void;
  step(f: ManeuverPanelFlight, dt: number): void;
  stop(): void;
  close(): void;
  readonly active: boolean;
  warpBudget(f: ManeuverPanelFlight): number;
}
export function mountManeuverPanel(
  root: Document,
  getState: () => ManeuverPanelState,
  {claim, sync}: ManeuverPanelHooks
): ManeuverPanel {
  const session = new ManeuverSession(),
    button = root.createElement('button');
  button.textContent = '自動噴射';
  const systems = root.querySelector('#flightSystems');
  if (!systems) throw Error('画面要素が見つかりません: #flightSystems');
  systems.append(button);
  let ui: ManeuverWindow | null = null,
    bound: ManeuverPanelFlight | null | undefined = null,
    node: ManeuverNodeRecord | null | undefined = null,
    message = '待機';
  const close = () => {
    ui?.panel.remove();
    ui = null;
  };
  const stop = () => {
    if (session.owner) {
      session.stop();
      message = '待機';
      sync();
    }
  };
  const fixed = (n: ManeuverNodeRecord | null | undefined) =>
    !!(n?.capture || n?.returnPlan || n?.departure || n?.rendezvous || n?.plannedThrottle !== undefined);
  function update() {
    const {flight: f, atCenter} = getState();
    if (session.owner && (session.owner !== f || atCenter || session.node !== f?.maneuver)) stop();
    if (bound !== f || node !== f?.maneuver) {
      bound = f;
      node = f?.maneuver;
      message = '待機';
      if (ui) configure(ui);
    }
    button.hidden =
      !f || atCenter || !canControl(f) || !f.parts.some(p => PARTS[p.type].thrustMedium === 'independent');
    if (button.hidden || !f) {
      close();
      return;
    }
    button.textContent = session.owner ? '自動噴射 · ' + session.message : '自動噴射';
    if (!ui) return;
    const {start, power, timing, status, readout} = ui,
      plan = session.plan;
    start.disabled = !!session.owner || !node || node.complete;
    power.disabled = timing.disabled = fixed(node) || !!session.owner;
    status.textContent = session.owner ? session.message : !node ? 'マップで計画を固定してください' : message;
    readout.textContent = node
      ? `残り ${Math.hypot(...node.remaining).toFixed(2)} m/s` +
        (session.owner
          ? (plan ?? missing('自動噴射の計画')).onAlignment && !session.lit
            ? ' · 姿勢がそろい次第開始'
            : ` · 開始まで ${Math.max(0, (plan ?? missing('自動噴射の計画')).startTime - f.universalTime).toFixed(1)}秒`
          : '')
      : '';
  }
  function configure({power, timing}: ManeuverWindow) {
    element(power, '[value="1"]', 'option').textContent =
      node?.returnPlan || node?.departure || node?.rendezvous?.burnThrottle === null ? '100→10→1%' : '100%';
    power.value = String(
      node && fixed(node)
        ? node.rendezvous
          ? (node.rendezvous.burnThrottle ?? 1)
          : (node.plannedThrottle ?? 1)
        : 0.1
    );
    timing.value = fixed(node) ? 'start' : 'center';
  }
  function open() {
    if (ui) {
      ui.panel.front();
      return;
    }
    const panel = floatingWindow(root.body, {title: '自動噴射', x: innerWidth - 330, y: 160, onClose: close});
    const power = root.createElement('select');
    power.setAttribute('aria-label', '自動噴射の推力');
    for (const [value, label] of [
      [0.01, '1%'],
      [0.1, '10%'],
      [1, '100%']
    ] as const) {
      const option = root.createElement('option');
      option.value = String(value);
      option.textContent = label;
      power.append(option);
    }
    const timing = root.createElement('select');
    timing.setAttribute('aria-label', '自動噴射の時刻基準');
    for (const [value, label] of [
      ['center', '中央基準'],
      ['start', '開始基準']
    ]) {
      const option = root.createElement('option');
      option.value = value;
      option.textContent = label;
      timing.append(option);
    }
    const start = root.createElement('button');
    start.textContent = '実行開始';
    const halt = root.createElement('button');
    halt.textContent = '停止';
    const status = root.createElement('output');
    status.setAttribute('role', 'status');
    const readout = root.createElement('p');
    start.onclick = () => {
      const f = getState().flight;
      try {
        session.start(f, {throttle: Number(power.value), timing: timing.value});
        claim();
        if (!f) missing('自動噴射の対象機体');
        session.previous = {
          sas: f.sas,
          sasMode: f.sasMode,
          navigationAuto: f.navigationAuto,
          navigationFrame: f.navigationFrame
        };
        message = '姿勢合わせ';
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
      }
      update();
    };
    halt.onclick = () => {
      stop();
      update();
    };
    power.onchange = timing.onchange = () => {
      stop();
      message = '待機';
      update();
    };
    panel.content.append(power, timing, start, halt, readout, status);
    ui = {panel, power, timing, start, status, readout};
    configure(ui);
    update();
  }
  function step(f: ManeuverPanelFlight, dt: number) {
    if (!session.owner) return;
    const phase = session.state;
    session.step(f, dt);
    if (!session.owner) message = session.message;
    if (phase !== session.state) sync();
  }
  button.onclick = open;
  const direct =
    '#throttle,#trim,#sas,#sasDirections,#sasMode,#stage,#autoLaunch,#autoReturn,#navigationFrame,#navigationAuto,#brake,#rcsEnabled,#reactionEnabled,#mapCutoff,#alignManeuver,#fixManeuver,#clearManeuver,#transferIgnite,#transferFine,#transferCutoff,#capturePanel button,#returnPanel button,#departurePanel button';
  for (const type of ['input', 'click', 'change'])
    root.addEventListener(
      type,
      e => {
        const target = e.target;
        if (!session.owner || !isControlTarget(target) || !target.closest?.(direct)) return;
        preserveManualControlEdit(target, stop);
      },
      true
    );
  window.addEventListener(
    'keydown',
    e => {
      if (
        !session.owner ||
        !acceptsFlightKey(e.target, e.code) ||
        !/^(Key[WASDQEZXCTBHRIJKLUO]|Space|ShiftLeft|ShiftRight)$/.test(e.code)
      )
        return;
      const f = session.owner;
      stop();
      if (['KeyX', 'KeyZ'].includes(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        f.throttle = e.code === 'KeyZ' ? 1 : 0;
        sync();
      }
      update();
    },
    true
  );
  return {
    update,
    step,
    stop,
    close,
    get active() {
      return !!session.owner;
    },
    warpBudget: f => maneuverWarpBudget(session, f)
  };
}

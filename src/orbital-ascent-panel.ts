import {hasVacuumEngine} from './engine-medium.js';
import {AscentSession, type AscentFlight, type AscentSettings} from './orbital-ascent-controller.js';
import {orbitalAscentSettings} from './orbital-ascent-settings.js';
import {floatingWindow, type FloatingWindow} from './floating-window.js';
import {acceptsFlightKey} from './flight-keyboard.js';
import {preserveManualControlEdit, type ManualControl} from './manual-control-edit.js';
import {element} from './dom.js';

export interface OrbitalAscentFlight extends AscentFlight {
  orbitalAscentSettings?: AscentSettings | null;
  parts: {id: string; type: string}[];
}
type ControlTarget = EventTarget & ManualControl & {closest?(selectors: string): Element | null};
// The fields the capture listener reads: an optional string value, boolean checked and closest().
const isControlTarget = (target: EventTarget | null): target is ControlTarget =>
  target !== null &&
  (!('value' in target) || target.value === undefined || typeof target.value === 'string') &&
  (!('checked' in target) || target.checked === undefined || typeof target.checked === 'boolean') &&
  (!('closest' in target) || target.closest === undefined || typeof target.closest === 'function');
function missing(what: string): never {
  throw Error(what + 'が見つかりません');
}
export interface OrbitalAscentState {
  flight: OrbitalAscentFlight | null | undefined;
  atCenter: boolean;
}
export interface OrbitalAscentHooks {
  claim(): void;
  sync(): void;
  onRemoved(id: string): void;
}
export interface OrbitalAscentPanel {
  update(): void;
  step(f: OrbitalAscentFlight, dt: number): void;
  stop(): void;
  close(): void;
  readonly active: boolean;
}
export function mountOrbitalAscent(
  root: Document,
  getState: () => OrbitalAscentState,
  {claim, sync, onRemoved}: OrbitalAscentHooks
): OrbitalAscentPanel {
  const session = new AscentSession(),
    button = root.createElement('button');
  button.textContent = '自動投入';
  const systems = root.querySelector('#flightSystems');
  if (!systems) throw Error('画面要素が見つかりません: #flightSystems');
  systems.append(button);
  let panel: FloatingWindow | null = null,
    shown: OrbitalAscentFlight | null = null,
    bound: OrbitalAscentFlight | null | undefined = null,
    message = '待機';
  const close = () => {
    panel?.remove();
    panel = null;
    shown = null;
  };
  const stop = () => {
    if (session.owner) {
      session.stop();
      message = '待機';
      sync();
    }
  };
  function render(f: OrbitalAscentFlight) {
    if (!panel) throw Error('自動投入の窓がありません');
    const content = panel.content;
    content.replaceChildren();
    shown = f;
    const settings = orbitalAscentSettings(f.orbitalAscentSettings ?? {}),
      inputs: Record<string, HTMLInputElement> = {};
    for (const [key, label, min, max, value] of [
      ['altitude', '軌道高度 km', 80, 500, settings.altitude / 1000],
      ['inclination', '軌道傾斜角 °', 0, 180, settings.inclination]
    ] as const) {
      const row = root.createElement('label'),
        input = root.createElement('input');
      row.textContent = label;
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.step = '1';
      input.value = String(value);
      input.setAttribute('aria-label', label);
      input.style.width = '90px';
      row.style.cssText = 'display:flex;justify-content:space-between;gap:12px;margin:6px 0';
      row.append(input);
      content.append(row);
      inputs[key] = input;
    }
    const read = () => {
      if (Object.values(inputs).some(input => input.value.trim() === ''))
        throw Error('目標を入力してください');
      return orbitalAscentSettings({
        altitude: Number(inputs.altitude.value) * 1000,
        inclination: Number(inputs.inclination.value)
      });
    };
    for (const input of Object.values(inputs))
      input.onchange = () => {
        stop();
        try {
          f.orbitalAscentSettings = read();
          message = '待機';
        } catch (e) {
          message = e instanceof Error ? e.message : String(e);
        }
        update();
      };
    const start = root.createElement('button'),
      halt = root.createElement('button'),
      status = root.createElement('output');
    start.textContent = '投入開始';
    halt.textContent = '停止';
    status.setAttribute('role', 'status');
    start.onclick = () => {
      try {
        const settings = read();
        session.start(f, settings);
        f.orbitalAscentSettings = settings;
        claim();
        message = '離昇';
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
      }
      update();
    };
    halt.onclick = () => {
      stop();
      update();
    };
    content.append(start, halt, status);
  }
  function update() {
    const {flight: f, atCenter} = getState();
    if (session.owner && (session.owner !== f || atCenter)) stop();
    if (bound !== f) {
      bound = f;
      message = '待機';
    }
    button.hidden = !f || atCenter || !hasVacuumEngine(f.parts);
    if (button.hidden || !f) {
      close();
      return;
    }
    button.textContent = session.owner
      ? '自動投入 · ' + (session.pilot ?? missing('自動投入の操縦')).phase
      : '自動投入';
    if (!panel) return;
    if (shown !== f) {
      message = '待機';
      render(f);
    }
    element(panel.content, 'output', 'output').textContent = session.owner ? session.message : message;
    element(panel.content, 'button', 'button').disabled = !!session.owner;
  }
  function step(f: OrbitalAscentFlight, dt: number) {
    if (!session.owner) return;
    const ids = new Set(f.parts.map(p => p.id)),
      was = session.owner,
      stage = f.stage,
      sas = f.sas;
    session.step(f, dt);
    for (const id of ids) if (!f.parts.some(p => p.id === id)) onRemoved(id);
    if (was && !session.owner) message = session.message;
    if (stage !== f.stage || sas !== f.sas || !session.owner) sync();
  }
  button.onclick = () => {
    if (panel) {
      panel.front();
      return;
    }
    panel = floatingWindow(root.body, {title: '自動投入', x: innerWidth - 330, y: 150, onClose: close});
    render(getState().flight ?? missing('自動投入の対象機体'));
    update();
  };
  const direct =
    '#throttle,#trim,#sas,#sasDirections,#sasMode,#stage,#autoLaunch,#autoReturn,#navigationFrame,#navigationAuto,#brake,#rcsEnabled,#reactionEnabled,#mapCutoff,#alignManeuver';
  for (const type of ['input', 'click', 'change'])
    root.addEventListener(
      type,
      e => {
        const target = e.target;
        if (session.owner && isControlTarget(target) && target.closest?.(direct))
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
        !/^(Key[WASDQEZXTB]|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(e.code)
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
    }
  };
}

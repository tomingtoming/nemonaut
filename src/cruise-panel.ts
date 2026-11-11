import {runwaySelection, runwaySelector} from './runway-selection.js';
import {floatingWindow, type FloatingWindow} from './floating-window.js';
import {
  CruisePilot,
  cruiseReadiness,
  cruiseSettings,
  cruiseTargetReadiness,
  cruiseAuthority,
  hasCruiseHardware,
  cruisePropulsion,
  type CruiseSettings,
  type CruisePrevious
} from './cruise-pilot.js';
import {
  TakeoffSession,
  departureReadiness,
  type TakeoffPilot,
  type AutopilotCommands
} from './takeoff-session.js';
import {TakeoffPreviewClient} from './takeoff-preview-client.js';
import {LandingSession, landingReadiness} from './landing-session.js';
import {LandingPlanClient} from './landing-plan-client.js';
import {ReturnSession} from './return-session.js';
import {returnReadiness} from './runway-return-pilot.js';
import {compassHeading} from './navigation.js';
import {bodyAltitude} from './celestial.js';
import {surfaceRelativeVelocity} from './surface-frame.js';
import {acceptsFlightKey} from './flight-keyboard.js';
import {preserveManualControlEdit, isControlTarget} from './manual-control-edit.js';
import {PARTS} from './catalog.js';
import * as T from 'three';
import {element} from './dom.js';
import {metrics} from './metrics.js';
import type {Flight} from './core.js';
/** The takeoff, landing and return sessions snapshot the whole vessel, so the panel works on a Flight. */
export type CruisePanelFlight = Flight;
export interface CruisePanelState {
  flight: CruisePanelFlight | null | undefined;
  atCenter: boolean;
}
export interface CruisePanelHooks {
  claim(): void;
  sync(): void;
}
export interface CruisePanel {
  update(): void;
  step(f: CruisePanelFlight, dt: number): AutopilotCommands | undefined;
  stop(reason?: string): void;
  close(): void;
  readonly active: boolean;
}
type CruiseNumberKey = Exclude<keyof CruiseSettings, 'mode'>;
const RETURN_STATUS: Readonly<Record<string, string | undefined>> = {
  return: '帰投',
  capture: '進入へ整列',
  planning: '着陸計算中',
  approach: '進入',
  rollout: '着陸滑走',
  'go-around': '復行',
  recovery: '高度600 mへ回復',
  'recovery-hold': '回復後の保持'
};
const LANDING_STATUS: Readonly<Record<string, string | undefined>> = {
  approach: '進入',
  rollout: '着陸滑走',
  'go-around': '復行',
  recovery: '復行後の高度捕捉',
  'recovery-hold': '復行後の保持'
};
const TAKEOFF_STATUS: Readonly<Record<string, string | undefined>> = {
  roll: '滑走',
  rotate: '機首上げ',
  climb: '上昇',
  capture: '巡航へ移行',
  abort: '離陸中止',
  stopped: '停止'
};

export function mountCruisePanel(
  root: Document,
  getState: () => CruisePanelState,
  {claim, sync}: CruisePanelHooks
): CruisePanel {
  let panel: FloatingWindow | null = null,
    pilot: CruisePilot | null = null,
    owner: CruisePanelFlight | null = null,
    shown: CruisePanelFlight | null = null,
    message = '待機',
    inputError: string | null = null;
  let takeoff: TakeoffPilot | null = null,
    takeoffPrevious: CruisePrevious | null = null,
    landingNotice: string | null = null;
  const departure = new TakeoffSession(
    new TakeoffPreviewClient(
      () => new Worker(new URL('./takeoff-forecast-worker.js', import.meta.url), {type: 'module'})
    )
  );
  const landing = new LandingSession(
    new LandingPlanClient(
      () => new Worker(new URL('./landing-plan-worker.js', import.meta.url), {type: 'module'})
    )
  );
  const returning = new ReturnSession(
    new LandingPlanClient(
      () => new Worker(new URL('./landing-plan-worker.js', import.meta.url), {type: 'module'})
    )
  );
  const returnStatus = () => (returning.owner ? RETURN_STATUS[returning.state] || returning.state : null);
  const activeLanding = () => (returning.landing.pilot ? returning.landing : landing);
  const landingStatus = () => {
    const phase = landing.pilot?.phase;
    return phase === undefined ? undefined : LANDING_STATUS[phase];
  };
  const takeoffStatus = () =>
    takeoff?.cruise && Math.abs(takeoff.cruise.target.speed - takeoff.target.speed) > 1
      ? '捕捉中'
      : (takeoff?.cruise?.status ?? (takeoff ? TAKEOFF_STATUS[takeoff.phase] : undefined) ?? '待機');
  const button = root.createElement('button');
  button.id = 'openCruise';
  button.textContent = '自動操縦';
  const systems = root.querySelector('#flightSystems');
  if (!systems) throw Error('画面要素が見つかりません: #flightSystems');
  systems.append(button);
  const close = () => {
    panel?.remove();
    panel = null;
    shown = null;
  };
  const ownerFlight = (): CruisePanelFlight => {
    if (!owner) throw Error('自動操縦の対象機体がありません');
    return owner;
  };
  const stop = (reason = '手動操縦') => {
    landingNotice = null;
    const pending = departure.state !== 'idle' || landing.state !== 'idle' || !!returning.owner,
      wasLanding = !!landing.pilot || !!returning.owner;
    returning.stop(reason === '異常停止' ? 'fault' : 'manual');
    departure.cancel();
    landing.stop(reason === '異常停止' ? 'fault' : 'manual');
    if (wasLanding) sync();
    if (takeoff) {
      const o = ownerFlight();
      Object.assign(o, takeoffPrevious);
      o.holdQ = o.q.clone();
      if (reason === '異常停止') o.throttle = 0;
      takeoff = null;
      message = reason;
      sync();
    }
    if (pilot) {
      pilot.stop(ownerFlight(), reason === '異常停止' ? 'fault' : 'manual');
      pilot = null;
      message = reason;
      sync();
    } else if (pending) message = reason;
  };
  function defaults(f: CruisePanelFlight): CruiseSettings {
    const heading = compassHeading(new T.Vector3(0, 0, 1).applyQuaternion(f.q), f.pos, f.universalTime) ?? 90;
    if (f.cruiseSettings) return f.cruiseSettings;
    const ground = f.environment === 'runway' && bodyAltitude(f.pos, f.universalTime) < 30;
    const value = {
      speed: Math.round(
        Math.max(
          ground ? 90 : 40,
          Math.min(350, surfaceRelativeVelocity(f.pos, f.vel, f.universalTime).length())
        )
      ),
      altitude: ground
        ? 600
        : Math.round(Math.max(300, Math.min(15000, bodyAltitude(f.pos, f.universalTime)))),
      heading: Math.round(heading) % 360,
      mode: 'altitude',
      vertical: 0
    };
    while (ground && value.speed < 350 && cruiseTargetReadiness(f, value)) value.speed += 5;
    return value;
  }
  function render(f: CruisePanelFlight) {
    const win = panel;
    if (!win) throw Error('自動操縦の窓が開いていません');
    inputError = null;
    win.content.replaceChildren();
    const settings = defaults(f),
      inputs: Record<string, HTMLInputElement> = {};
    for (const [key, label, min, max, step] of [
      ['speed', '対気速度 m/s', 40, 350, 1],
      ['altitude', '高度 m', 300, 15000, 10],
      ['vertical', '昇降率 m/s', -10, 10, 0.5],
      ['heading', '針路 °', 0, 359, 1]
    ] as const satisfies readonly (readonly [CruiseNumberKey, string, number, number, number])[]) {
      const row = root.createElement('label'),
        input = root.createElement('input');
      row.textContent = label;
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(settings[key]);
      input.setAttribute('aria-label', label);
      input.style.width = '90px';
      row.style.cssText = 'display:flex;justify-content:space-between;gap:12px;margin:6px 0';
      row.append(input);
      win.content.append(row);
      inputs[key] = input;
    }
    const mode = root.createElement('select');
    mode.setAttribute('aria-label', '垂直制御');
    for (const [value, label] of [
      ['altitude', '高度保持'],
      ['vertical', '昇降率保持']
    ]) {
      const o = root.createElement('option');
      o.value = value;
      o.textContent = label;
      mode.append(o);
    }
    mode.value = settings.mode;
    const settingsNow = () =>
      cruiseSettings({
        ...Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, Number(v.value)])),
        mode: mode.value
      });
    const apply = () => {
      departure.cancel();
      if (takeoff || landing.pilot || returning.owner) stop();
      try {
        const next = settingsNow();
        const problem = cruiseTargetReadiness(f, next);
        if (problem) throw Error(problem);
        inputError = null;
        f.cruiseSettings = next;
        if (pilot && owner === f) {
          pilot.target = {...next};
          pilot.duration = 0;
          pilot.settled = 0;
        }
        message = '待機';
      } catch (error) {
        inputError = error instanceof Error ? error.message : String(error);
      }
      update();
    };
    for (const input of Object.values(inputs)) {
      input.oninput = apply;
      input.onchange = apply;
    }
    mode.onchange = apply;
    const start = root.createElement('button');
    start.id = 'cruiseStart';
    start.textContent = '開始';
    start.onclick = () => {
      try {
        const next = cruiseSettings({
          ...Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, Number(v.value)])),
          mode: mode.value
        });
        inputError = null;
        const reason = cruiseReadiness(f) || cruiseTargetReadiness(f, next);
        if (reason) {
          message = reason;
          update();
          return;
        }
        claim();
        stop();
        owner = f;
        f.cruiseSettings = next;
        pilot = new CruisePilot(f, next);
        metrics.autopilot('cruise');
        message = '捕捉中';
        sync();
      } catch (error) {
        inputError = error instanceof Error ? error.message : String(error);
      }
      update();
    };
    const halt = root.createElement('button');
    halt.textContent = '停止';
    halt.onclick = () => {
      stop();
      update();
    };
    const predict = root.createElement('button');
    predict.id = 'takeoffForecast';
    predict.textContent = '離陸予測';
    predict.onclick = async () => {
      stop();
      owner = f;
      inputError = null;
      message = '予測中';
      update();
      try {
        const next = settingsNow();
        f.cruiseSettings = next;
        const result = await departure.prepare(f, next);
        if (getState().flight !== f) return;
        if (result.status === 'cancelled') return;
        message =
          result.status === 'stale'
            ? '状態が変わりました · 再予測'
            : result.accepted
              ? '離陸準備完了'
              : result.status === 'airborne'
                ? '滑走路の余裕不足'
                : '離陸を予測できません';
      } catch (error) {
        inputError = error instanceof Error ? error.message : String(error);
      }
      update();
    };
    const depart = root.createElement('button');
    depart.id = 'takeoffStart';
    depart.textContent = '離陸開始';
    depart.onclick = () => {
      try {
        inputError = null;
        const next = settingsNow(),
          candidate = departure.start(f, next);
        claim();
        if (pilot) {
          pilot.stop(ownerFlight());
          pilot = null;
        }
        owner = f;
        takeoffPrevious = {sas: f.sas, sasMode: f.sasMode, trim: f.trim};
        takeoff = candidate;
        metrics.autopilot('takeoff');
        message = '滑走';
        sync();
      } catch (error) {
        inputError = error instanceof Error ? error.message : String(error);
      }
      update();
    };
    const prepareLanding = root.createElement('button');
    prepareLanding.id = 'landingPrepare';
    prepareLanding.textContent = '着陸準備';
    prepareLanding.onclick = async () => {
      owner = f;
      inputError = null;
      message = '着陸計算中';
      landingNotice = null;
      try {
        const pending = landing.prepare(f, {end: runwaySelection.end});
        update();
        const result = await pending;
        if (getState().flight !== f || result.status === 'cancelled') return;
        landingNotice =
          result.status === 'ready'
            ? `着陸準備完了 · ${runwaySelection.end}`
            : result.status === 'stale'
              ? '進入状態が変わりました · 再準備'
              : '着陸速度を算出できません';
      } catch (error) {
        inputError = error instanceof Error ? error.message : String(error);
      }
      update();
    };
    const land = root.createElement('button');
    land.id = 'landingStart';
    land.textContent = '着陸開始';
    land.onclick = () => {
      try {
        inputError = null;
        if (!landing.readyFor(f)) throw Error('進入状態が変わりました。着陸を再準備してください');
        claim();
        departure.cancel();
        if (pilot) {
          pilot.stop(ownerFlight());
          pilot = null;
        }
        if (takeoff) {
          const o = ownerFlight();
          Object.assign(o, takeoffPrevious);
          o.holdQ = o.q.clone();
          takeoff = null;
        }
        owner = f;
        landing.start(f);
        metrics.autopilot('landing');
        landingNotice = null;
        message = '進入';
        sync();
      } catch (error) {
        inputError = error instanceof Error ? error.message : String(error);
      }
      update();
    };
    const returnButton = root.createElement('button');
    returnButton.id = 'aircraftReturn';
    returnButton.textContent = '帰投・着陸';
    returnButton.onclick = () => {
      try {
        inputError = null;
        const next = settingsNow(),
          reason = returnReadiness(f, next.speed, runwaySelection.end);
        if (reason) throw Error(reason);
        claim();
        stop();
        owner = f;
        returning.start(f, {speed: next.speed, end: runwaySelection.end});
        metrics.autopilot('return');
        message = '帰投';
        sync();
      } catch (error) {
        inputError = error instanceof Error ? error.message : String(error);
      }
      update();
    };
    const goAround = root.createElement('button');
    goAround.id = 'landingGoAround';
    goAround.textContent = '復行';
    goAround.onclick = () => {
      activeLanding().goAround(f);
      update();
    };
    const out = root.createElement('output');
    out.id = 'cruiseStatus';
    out.style.cssText = 'display:block;margin-top:8px';
    const direction = runwaySelector(root);
    direction.id = 'autopilotRunwayEnd';
    win.content.append(
      mode,
      direction,
      start,
      predict,
      depart,
      returnButton,
      prepareLanding,
      land,
      goAround,
      halt,
      out
    );
    shown = f;
  }
  function update(): void {
    const {flight: f, atCenter} = getState();
    if (
      (pilot || takeoff || returning.owner || departure.state !== 'idle' || landing.state !== 'idle') &&
      (owner !== f || atCenter)
    )
      stop('機体切替 · 待機');
    runwaySelection.bind(f);
    button.hidden = !f || atCenter || !hasCruiseHardware(f);
    if (button.hidden || !f) {
      close();
      return;
    }
    const status = returnStatus() || landingStatus() || (takeoff ? takeoffStatus() : pilot?.status);
    button.textContent = status ? '自動操縦 · ' + status : '自動操縦';
    if (!panel) return;
    if (shown !== f) render(f);
    element(panel.content, '#autopilotRunwayEnd', 'select').value = runwaySelection.end;
    const ground = f.environment === 'runway' && bodyAltitude(f.pos, f.universalTime) < 30;
    if (departure.state === 'ready' && !departure.readyFor(f, defaults(f)))
      message = '状態が変わりました · 再予測';
    if (landing.state === 'ready' && !landing.readyFor(f)) landingNotice = '進入状態が変わりました · 再準備';
    const preparing =
      landing.state === 'planning'
        ? '着陸計算中'
        : landing.state === 'ready'
          ? `着陸準備完了 · ${runwaySelection.end}`
          : null;
    const out = element(panel.content, 'output', 'output');
    out.textContent =
      inputError ||
      (returning.owner && returning.message) ||
      preparing ||
      landingNotice ||
      status ||
      (message === '待機'
        ? (ground ? departureReadiness(f, defaults(f)) : cruiseReadiness(f)) || message
        : message);
    element(panel.content, '#cruiseStart', 'button').disabled =
      !!pilot ||
      !!takeoff ||
      !!landing.pilot ||
      !!returning.owner ||
      landing.state === 'planning' ||
      departure.state === 'predicting';
    element(panel.content, '#takeoffForecast', 'button').hidden = !ground;
    element(panel.content, '#takeoffForecast', 'button').disabled =
      !!pilot ||
      !!takeoff ||
      !!landing.pilot ||
      !!returning.owner ||
      landing.state === 'planning' ||
      departure.state === 'predicting';
    element(panel.content, '#landingPrepare', 'button').hidden = ground;
    element(panel.content, '#landingPrepare', 'button').disabled =
      !!landing.pilot || !!returning.owner || landing.state === 'planning';
    element(panel.content, '#landingPrepare', 'button').title =
      landingReadiness(f, runwaySelection.end) || '';
    element(panel.content, '#landingGoAround', 'button').hidden = !activeLanding().pilot;
    element(panel.content, '#landingGoAround', 'button').disabled =
      activeLanding().pilot?.phase !== 'approach';
    element(panel.content, '#landingStart', 'button').hidden = ground;
    element(panel.content, '#landingStart', 'button').disabled =
      landing.state !== 'ready' || !!returning.owner;
    element(panel.content, '#takeoffStart', 'button').hidden = !ground;
    element(panel.content, '#takeoffStart', 'button').disabled =
      departure.state !== 'ready' || !!pilot || !!takeoff || !!returning.owner;
    element(panel.content, '#aircraftReturn', 'button').hidden = ground;
    element(panel.content, '#aircraftReturn', 'button').disabled =
      !!returning.owner ||
      !!landing.pilot ||
      landing.state === 'planning' ||
      departure.state === 'predicting';
    element(panel.content, '#aircraftReturn', 'button').title =
      returnReadiness(f, defaults(f).speed, runwaySelection.end) || '';
  }
  function step(f: CruisePanelFlight, dt: number): AutopilotCommands | undefined {
    if (returning.owner) {
      const wasSas = f.sas,
        wasMode = f.sasMode,
        commands = returning.step(f, dt);
      if (!returning.owner) {
        message =
          returning.state === 'landed'
            ? '着陸完了'
            : returning.state === 'failed'
              ? '異常停止 · ' + (returning.message || '制御不能')
              : '待機';
        sync();
      } else if (wasSas !== f.sas || wasMode !== f.sasMode) sync();
      return commands;
    }
    if (landing.pilot) {
      const wasSas = f.sas,
        wasMode = f.sasMode,
        commands = landing.step(f, dt);
      if (!landing.pilot) {
        message =
          landing.state === 'landed'
            ? '着陸完了'
            : landing.state === 'failed'
              ? '異常停止 · ' + (landing.faultMessage || '制御不能')
              : '待機';
        sync();
      } else if (wasSas !== f.sas || wasMode !== f.sasMode) sync();
      return commands;
    }
    if (takeoff) {
      if (f !== owner) {
        stop('機体切替 · 待機');
        return {};
      }
      const fault = cruiseAuthority(f) || cruisePropulsion(f);
      if (fault) {
        stop('異常停止');
        message = fault;
        return {};
      }
      const wasSas = f.sas,
        wasMode = f.sasMode;
      const commands = takeoff.update(f, dt);
      if (takeoff.phase === 'stopped') stop('異常停止');
      else if (wasSas !== f.sas || wasMode !== f.sasMode) sync();
      return commands;
    }
    if (!pilot) return;
    if (f !== owner) {
      stop('機体切替 · 待機');
      return;
    }
    if (!hasCruiseHardware(f)) {
      stop('異常停止');
      return;
    }
    const wasSas = f.sas,
      wasMode = f.sasMode;
    pilot.update(f, dt);
    if (!pilot.running) {
      const detail = pilot.faultMessage;
      stop('異常停止');
      if (detail) message = '異常停止 · ' + detail;
    } else if (wasSas !== f.sas || wasMode !== f.sasMode) sync();
  }
  button.onclick = () => {
    if (panel) {
      panel.front();
      return;
    }
    panel = floatingWindow(root.body, {title: '自動操縦', x: innerWidth - 330, y: 150, onClose: close});
    panel.element.classList.add('cruiseWindow');
    const f = getState().flight;
    if (!f) throw Error('自動操縦の対象機体がありません');
    render(f);
    update();
  };
  const direct =
    '#throttle,#trim,#sas,#sasDirections,#stage,#autoLaunch,#autoReturn,#navigationFrame,#navigationAuto,#brake';
  for (const type of ['input', 'click'])
    root.addEventListener(
      type,
      e => {
        const target = e.target;
        if (isControlTarget(target) && target.closest?.(direct))
          preserveManualControlEdit(target, () => {
            stop();
            update();
          });
      },
      true
    );
  window.addEventListener(
    'keydown',
    e => {
      if (!acceptsFlightKey(e.target, e.code)) return;
      if (/^(Key[WASDQEZXCTB]|Space|ShiftLeft|ShiftRight)$/.test(e.code)) {
        const controlled = pilot || takeoff || landing.pilot || returning.owner ? owner : null;
        stop();
        // The throttle command that releases cruise is applied here as well, so it also
        // holds while paused, where the main key handler ignores keys.
        if (controlled && ['KeyX', 'KeyZ'].includes(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          controlled.throttle = e.code === 'KeyX' ? 0 : 1;
          sync();
        }
        update();
      }
    },
    true
  );
  runwaySelection.subscribe(() => {
    if (landing.state !== 'idle' || returning.owner) stop('着陸方向変更 · 待機');
    inputError = null;
    landingNotice = null;
    update();
  });
  return {
    update,
    step,
    stop,
    close,
    get active() {
      return !!pilot || !!takeoff || !!landing.pilot || !!returning.owner;
    }
  };
}

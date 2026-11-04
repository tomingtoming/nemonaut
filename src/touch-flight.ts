// Flight controls for touch devices (BACKLOG 8b): a virtual stick (W/S, A/D), roll (Q/E), full throttle /
// cut (Z/X), stage (Space) and RCS translation (I/K, J/L, U/O). They feed the keyboard's own path: every
// press and release is dispatched to window as the equivalent KeyboardEvent, so the held-key set, its gates
// (pause, modal, observed vessel), the warp drop to 1×, the rocket-axes swap and the capture listeners that
// cancel the launch pilot, autopilots and auto-docking all behave exactly as with the keyboard. The controls
// are display:none unless body.touch (style.css), so a mouse never reaches them; the periodic sync and the
// release handlers do nothing while nothing is held and body.touch is off.
import {state} from './app-state.js';
import {PARTS} from './catalog.js';
import {hasRetractableGear} from './landing-gear.js';

/** The stick deflection as a vector in the unit disc; x to the right, y up (screen y points down). */
export function stickVector(dx: number, dy: number, radius: number): {x: number; y: number} {
  if (!(radius > 0)) return {x: 0, y: 0};
  const x = dx / radius,
    y = (0 - dy) / radius,
    length = Math.hypot(x, y);
  return length > 1 ? {x: x / length, y: y / length} : {x, y};
}
/** The held keys for a stick vector: up W, down S, left A, right D; each axis past the threshold. */
export function stickCodes({x, y}: {x: number; y: number}, threshold = 0.35): string[] {
  const codes: string[] = [];
  if (y > threshold) codes.push('KeyW');
  else if (y < -threshold) codes.push('KeyS');
  if (x < -threshold) codes.push('KeyA');
  else if (x > threshold) codes.push('KeyD');
  return codes;
}
export type KeyEmit = (type: 'keydown' | 'keyup', code: string, repeat: boolean) => void;
/** The keys held by each touch pointer; emits keydown/keyup only when the union of held keys changes. */
export class TouchKeys {
  private readonly pointers = new Map<number, Set<string>>();
  constructor(private readonly emit: KeyEmit) {}
  held(): Set<string> {
    const all = new Set<string>();
    for (const codes of this.pointers.values()) for (const code of codes) all.add(code);
    return all;
  }
  set(pointer: number, codes: Iterable<string>): void {
    const before = this.held();
    const next = new Set(codes);
    if (next.size) this.pointers.set(pointer, next);
    else this.pointers.delete(pointer);
    this.changed(before);
  }
  release(pointer: number): void {
    this.set(pointer, []);
  }
  releaseAll(): void {
    const before = this.held();
    this.pointers.clear();
    this.changed(before);
  }
  /** Re-sends the held keys as auto-repeat, as a held keyboard key does (re-adds them after keys.clear()). */
  repeat(): void {
    for (const code of this.held()) this.emit('keydown', code, true);
  }
  private changed(before: Set<string>): void {
    const after = this.held();
    for (const code of before) if (!after.has(code)) this.emit('keyup', code, false);
    for (const code of after) if (!before.has(code)) this.emit('keydown', code, false);
  }
}

const BUTTONS: readonly (readonly [
  code: string,
  label: string,
  aria: string,
  group: 'roll' | 'main' | 'rcs'
])[] = [
  ['KeyQ', '↺', '左にロール', 'roll'],
  ['KeyE', '↻', '右にロール', 'roll'],
  ['KeyZ', '全推力', 'スロットル全開', 'main'],
  ['KeyX', '推力0', 'スロットル停止', 'main'],
  ['Space', '次段', '点火 / 次段', 'main'],
  // Landing gear (BACKLOG 9c): shown only on a vessel with retractable gear; the label follows the gear.
  ['KeyG', 'ギア上げ', 'ランディングギアの出し入れ', 'main'],
  ['KeyU', '上へ', 'RCS 上へ並進', 'rcs'],
  ['KeyI', '前へ', 'RCS 前へ並進', 'rcs'],
  ['KeyO', '下へ', 'RCS 下へ並進', 'rcs'],
  ['KeyJ', '左へ', 'RCS 左へ並進', 'rcs'],
  ['KeyK', '後へ', 'RCS 後ろへ並進', 'rcs'],
  ['KeyL', '右へ', 'RCS 右へ並進', 'rcs']
];

/** Builds the touch flight controls inside #flightHud and wires them. Called once by app.ts. */
export function mountTouchFlight(hud: HTMLElement, body: HTMLElement = document.body): TouchKeys {
  const touchKeys = new TouchKeys((type, code, repeat) => {
    window.dispatchEvent(new KeyboardEvent(type, {code, repeat, bubbles: true, cancelable: true}));
  });
  const root = document.createElement('div'),
    left = document.createElement('div'),
    right = document.createElement('div'),
    rcs = document.createElement('div'),
    stick = document.createElement('div'),
    knob = document.createElement('div'),
    caption = document.createElement('small'),
    groups = {roll: document.createElement('div'), main: document.createElement('div'), rcs};
  root.id = 'touchFlight';
  left.className = 'touchLeft';
  right.className = 'touchRight';
  rcs.className = 'touchRcs';
  rcs.hidden = true;
  groups.roll.className = 'touchRoll';
  groups.main.className = 'touchMain';
  stick.id = 'touchStick';
  stick.setAttribute('role', 'application');
  stick.setAttribute('aria-label', '姿勢スティック');
  knob.className = 'touchKnob';
  caption.textContent = '姿勢';
  stick.append(caption, knob);
  const rcsTitle = document.createElement('small');
  rcsTitle.textContent = 'RCS並進';
  rcs.append(rcsTitle);
  left.append(rcs, stick);
  right.append(groups.roll, groups.main);
  root.append(left, right);
  hud.append(root);
  // The compact touch console shows the SAS directions above it on demand (hidden by CSS without
  // body.touch); choosing a direction closes them again.
  const nav = hud.querySelector('.navpanel');
  if (nav) {
    const sasToggle = document.createElement('button');
    sasToggle.type = 'button';
    sasToggle.id = 'touchSasToggle';
    sasToggle.textContent = 'SAS方向';
    sasToggle.setAttribute('aria-expanded', 'false');
    const showSas = (open: boolean) => {
      nav.classList.toggle('touchSasOpen', open);
      sasToggle.setAttribute('aria-expanded', String(open));
    };
    sasToggle.onclick = () => showSas(!nav.classList.contains('touchSasOpen'));
    nav.addEventListener('click', e => {
      if (e.target instanceof Element && e.target.closest('#sasDirections button')) showSas(false);
    });
    nav.append(sasToggle);
  }
  const showHeld = () => {
    root.dataset.held = [...touchKeys.held()].sort().join(' ');
  };
  const releasePointer = (e: PointerEvent) => {
    touchKeys.release(e.pointerId);
    showHeld();
  };
  for (const [code, label, aria, group] of BUTTONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', aria);
    button.dataset.code = code;
    button.addEventListener('pointerdown', e => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      touchKeys.set(e.pointerId, [code]);
      showHeld();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
      button.addEventListener(type, releasePointer);
    groups[group].append(button);
  }
  const gearButton = groups.main.querySelector('[data-code="KeyG"]');
  if (gearButton instanceof HTMLButtonElement) gearButton.hidden = true;
  let stickPointer: number | null = null;
  const moveStick = (e: PointerEvent) => {
    const box = stick.getBoundingClientRect(),
      radius = box.width / 2,
      v = stickVector(e.clientX - box.left - radius, e.clientY - box.top - radius, radius);
    knob.style.transform = `translate(${v.x * radius * 0.6}px,${-v.y * radius * 0.6}px)`;
    touchKeys.set(e.pointerId, stickCodes(v));
    showHeld();
  };
  const endStick = (e: PointerEvent) => {
    if (e.pointerId !== stickPointer) return;
    stickPointer = null;
    knob.style.transform = '';
    releasePointer(e);
  };
  stick.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (stickPointer !== null) return;
    stickPointer = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    moveStick(e);
  });
  stick.addEventListener('pointermove', e => {
    if (e.pointerId === stickPointer) moveStick(e);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
    stick.addEventListener(type, endStick);
  root.addEventListener('contextmenu', e => e.preventDefault());
  const releaseAll = () => {
    if (stickPointer !== null) {
      stickPointer = null;
      knob.style.transform = '';
    }
    touchKeys.releaseAll();
    showHeld();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  });
  window.addEventListener('blur', releaseAll);
  window.addEventListener('pagehide', releaseAll);
  // Auto-repeat like a held key, the end of the flight releases everything, and the RCS pad and the stick
  // caption follow the vessel. Nothing runs without body.touch except a release when keys are still held.
  setInterval(() => {
    const flight = state.flight;
    if (
      !flight ||
      state.atCenter ||
      !body.classList.contains('touch') ||
      !body.classList.contains('flying')
    ) {
      if (touchKeys.held().size) releaseAll();
      return;
    }
    touchKeys.repeat();
    rcs.hidden = !(flight.rcsEnabled || flight.portTranslationEnabled);
    const rover = flight.parts.some(p => PARTS[p.type].poweredWheel === true);
    caption.textContent = rover ? '走行' : '姿勢';
    stick.setAttribute('aria-label', rover ? '走行スティック' : '姿勢スティック');
    if (gearButton instanceof HTMLButtonElement) {
      gearButton.hidden = !hasRetractableGear(flight.parts);
      gearButton.textContent = flight.gearDeployed ? 'ギア上げ' : 'ギア下げ';
      gearButton.classList.toggle('touchGearUp', !flight.gearDeployed);
    }
  }, 100);
  return touchKeys;
}

// Part windows on touch (BACKLOG 8c): a long press on the 3D canvas over a part opens the same window as the
// right click does there (flight part window or workshop design part window). Only pointers with pointerType
// 'touch' enter the recognizer, so a mouse never goes through this path. A second finger (pinch) cancels the
// press; when the press fires, the caller cancels the pending tap (select / place) of its release.

export interface LongPressTimer {
  set(fire: () => void, ms: number): number;
  clear(id: number): void;
}
const windowTimer: LongPressTimer = {
  set: (fire, ms) => window.setTimeout(fire, ms),
  clear: id => window.clearTimeout(id)
};
/** Recognizes one finger held still: fires once after `delay` ms unless it moves more than `slop` px. */
export class LongPress {
  private readonly down = new Set<number>();
  private press: {id: number; x: number; y: number; timer: number} | null = null;
  constructor(
    private readonly onFire: (x: number, y: number) => void,
    private readonly timer: LongPressTimer = windowTimer,
    private readonly delay = 500,
    private readonly slop = 10
  ) {}
  get pending(): boolean {
    return this.press !== null;
  }
  /** A finger touches; `start` false records the finger without starting a press (e.g. while placing). */
  pointerDown(id: number, x: number, y: number, start = true): void {
    this.down.add(id);
    this.cancel();
    if (!start || this.down.size > 1) return;
    const timer = this.timer.set(() => this.fire(), this.delay);
    this.press = {id, x, y, timer};
  }
  pointerMove(id: number, x: number, y: number): void {
    if (this.press?.id === id && Math.hypot(x - this.press.x, y - this.press.y) > this.slop) this.cancel();
  }
  /** A finger lifts or is cancelled. */
  pointerUp(id: number): void {
    this.down.delete(id);
    if (this.press?.id === id) this.cancel();
  }
  /** Forgets every finger (the canvas lost them, e.g. the page was hidden). */
  reset(): void {
    this.down.clear();
    this.cancel();
  }
  /** Fires now if a press is pending (the browser's own long-press signal came first). */
  fireNow(): void {
    if (this.press) this.fire();
  }
  cancel(): void {
    if (!this.press) return;
    this.timer.clear(this.press.timer);
    this.press = null;
  }
  private fire(): void {
    const press = this.press;
    if (!press) return;
    this.timer.clear(press.timer);
    this.press = null;
    this.onFire(press.x, press.y);
  }
}
/**
 * Wires the long press on the canvas. `canStart` gates a press when the finger touches and again when it
 * fires; `open` opens the part window at the press point (and cancels the release's tap).
 */
export function wireTouchPartWindows(
  canvas: HTMLElement,
  canStart: () => boolean,
  open: (x: number, y: number) => void
): void {
  const press = new LongPress((x, y) => {
    if (!canStart()) return;
    if ('vibrate' in navigator) navigator.vibrate(15);
    open(x, y);
  });
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') press.pointerDown(e.pointerId, e.clientX, e.clientY, canStart());
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') press.pointerMove(e.pointerId, e.clientX, e.clientY);
  });
  for (const type of ['pointerup', 'pointercancel'] as const)
    canvas.addEventListener(type, e => {
      if (e.pointerType === 'touch') press.pointerUp(e.pointerId);
    });
  // The browser's own long-press gesture (contextmenu; suppressed in workshop-place) may come first.
  canvas.addEventListener('contextmenu', () => press.fireNow());
  document.addEventListener('visibilitychange', () => press.reset());
}

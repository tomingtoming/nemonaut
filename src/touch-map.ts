// Orbit map on touch (BACKLOG 8d): pinch zoom, double tap re-centre and finger-sized hit areas. The map
// (flight-map.ts) only feeds pointers with pointerType 'touch' into these, so a mouse never reaches them.

/** Zoom limits of the map extent (metres), shared by the wheel and the pinch. */
export const MAP_EXTENT_MIN = 10000,
  MAP_EXTENT_MAX = 6e7;

export function clampExtent(extent: number): number {
  return Math.min(MAP_EXTENT_MAX, Math.max(MAP_EXTENT_MIN, extent));
}

/** Extent after pinching from `startDistance` to `distance` px: fingers apart zoom in (smaller extent). */
export function pinchExtent(startExtent: number, startDistance: number, distance: number): number {
  if (!(startDistance > 0) || !(distance > 0)) return clampExtent(startExtent);
  return clampExtent(startExtent * (startDistance / distance));
}

/** Pick radius in px: a finger gets twice the mouse radius and at least 24 px. */
export function hitRadius(base: number, pointerType: string): number {
  return pointerType === 'touch' ? Math.max(24, base * 2) : base;
}

/** Recognizes two taps within `interval` ms and `slop` px; the second tap of a pair is consumed. */
export class DoubleTap {
  private last: {time: number; x: number; y: number} | null = null;
  constructor(
    private readonly interval = 300,
    private readonly slop = 20
  ) {}
  /** Records a tap; true when it completes a double tap. */
  tap(time: number, x: number, y: number): boolean {
    const last = this.last;
    if (last && time - last.time <= this.interval && Math.hypot(x - last.x, y - last.y) <= this.slop) {
      this.last = null;
      return true;
    }
    this.last = {time, x, y};
    return false;
  }
  /** Forgets the pending first tap (e.g. after a drag or pinch). */
  reset(): void {
    this.last = null;
  }
}

/** Tracks the touch pointers on the map and reports a two-finger pinch. */
export class Pinch {
  private readonly points = new Map<number, {x: number; y: number}>();
  private start: {distance: number; extent: number} | null = null;
  get count(): number {
    return this.points.size;
  }
  get active(): boolean {
    return this.start !== null;
  }
  /** A finger lands; returns true when it starts a pinch (the caller cancels its one-finger drag). */
  down(id: number, x: number, y: number, extent: number | null): boolean {
    this.points.set(id, {x, y});
    if (this.points.size !== 2 || extent === null) return false;
    this.start = {distance: this.distance(), extent};
    return true;
  }
  /** A finger moves; returns the new extent while pinching, otherwise null. */
  move(id: number, x: number, y: number): number | null {
    const point = this.points.get(id);
    if (!point) return null;
    point.x = x;
    point.y = y;
    if (!this.start || this.points.size !== 2) return null;
    return pinchExtent(this.start.extent, this.start.distance, this.distance());
  }
  /** A finger lifts or is cancelled; the pinch ends when fewer than two fingers remain. */
  up(id: number): void {
    this.points.delete(id);
    if (this.points.size < 2) this.start = null;
  }
  private distance(): number {
    const [a, b] = [...this.points.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}

// Placing parts on touch. A mouse previews the ghost by hovering and places with one click; a
// finger cannot hover, so on touch the first tap only moves the ghost there (a preview) and a second tap
// commits it: a tap near the previewed point (same view) or on the same attachment node. A tap elsewhere
// moves the preview. workshop-place.ts only sends pointers with pointerType 'touch' here, so the mouse path
// is unchanged. Also enlarges the transform gizmo on touch devices.
import {TOUCH_QUERY} from './touch-device.js';

/** Screen distance (px) within which a second tap commits the previewed placement. */
export const TOUCH_COMMIT_RADIUS = 30;
/** Gizmo size factor on touch devices (larger handles for a finger). */
export const TOUCH_GIZMO_SCALE = 1.8;

interface Preview {
  x: number;
  y: number;
  /** Discrete attach target of the preview (e.g. a parent node), or null for surface / free placement. */
  target: string | null;
  view: readonly number[];
}
export type TouchPlacementAction = 'preview' | 'commit' | 'none';

/** Whether two camera matrices are the same view (the screen point of the preview still means the same spot). */
export function sameView(a: readonly number[], b: readonly number[], tolerance = 1e-3): boolean {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
}

/** Recognizes preview and commit taps while placing. */
export class TouchPlacementTaps {
  private preview: Preview | null = null;
  constructor(private readonly radius = TOUCH_COMMIT_RADIUS) {}
  get previewing(): boolean {
    return this.preview !== null;
  }
  /**
   * A tap at (x, y) seen from camera matrix `view`. `pose` moves the ghost under the tap and returns its
   * attach target (null when it has no discrete target), or undefined when there is no valid pose there.
   * 'commit': place the pose now shown; 'preview': the ghost moved there; 'none': nothing to place there.
   */
  tap(
    x: number,
    y: number,
    view: readonly number[],
    pose: () => string | null | undefined
  ): TouchPlacementAction {
    const before = this.preview;
    if (before && sameView(before.view, view) && Math.hypot(x - before.x, y - before.y) <= this.radius) {
      this.preview = null;
      return 'commit';
    }
    const target = pose();
    if (target === undefined) {
      this.preview = null;
      return 'none';
    }
    if (before && target !== null && target === before.target) {
      this.preview = null;
      return 'commit';
    }
    this.preview = {x, y, target, view: [...view]};
    return 'preview';
  }
  reset(): void {
    this.preview = null;
  }
}

/** Larger gizmo handles while the device is a touch device; the mouse keeps the size it was created with. */
export function wireTouchGizmoSize(
  gizmo: {size: number; setSize(size: number): void},
  media:
    | ((query: string) => Pick<MediaQueryList, 'matches' | 'addEventListener'>)
    | undefined = globalThis.matchMedia
): void {
  if (typeof media !== 'function') return;
  const base = gizmo.size,
    query = media(TOUCH_QUERY);
  const apply = () => gizmo.setSize(query.matches ? base * TOUCH_GIZMO_SCALE : base);
  apply();
  query.addEventListener('change', apply);
}

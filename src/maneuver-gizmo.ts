import {bodyState} from './celestial.js';
import {projectTrackingPoint} from './tracking-orbits.js';
export interface ManeuverHandle {
  id: string;
  color: string;
  label: string;
  dx: number;
  dy: number;
  sign: number;
}
export function maneuverHandles(
  preview:
    import('./maneuver.js').ManeuverPreview | import('./maneuver.js').NodeOrbitPreview | null | undefined,
  yaw: number,
  pitch: number
): ManeuverHandle[] {
  if (!preview?.burnVel) return [];
  const p = preview.burnVel
      .clone()
      .sub(bodyState(preview.orbit.body, preview.universalTime).velocity)
      .normalize(),
    n = preview.orbit.r.clone().cross(p).normalize(),
    r = p.clone().cross(n).normalize();
  if (n.lengthSq() < 0.5) return [];
  const axes: [string, import('three').Vector3, string, string][] = [
    ['planDeltaV', p, '#b5ed77', '順'],
    ['planNormal', n, '#d6a0ff', '面'],
    ['planRadial', r, '#7de6ef', '径']
  ];
  return axes.flatMap(([id, v, color, label]) => {
    const [x, y] = projectTrackingPoint(v.toArray(), yaw, pitch),
      length = Math.hypot(x, y);
    return length < 0.15
      ? []
      : [-1, 1].map(sign => ({
          id,
          color,
          label: label + (sign > 0 ? '＋' : '−'),
          dx: (x / length) * sign,
          dy: (-y / length) * sign,
          sign
        }));
  });
}
export function draggedComponent(
  start: number,
  dx: number,
  dy: number,
  handle: Pick<ManeuverHandle, 'dx' | 'dy' | 'sign'>,
  others: readonly number[],
  fine = false
): number {
  const max = Math.sqrt(Math.max(0, 1e8 - others.reduce((n, v) => n + v * v, 0))),
    value = start + (dx * handle.dx + dy * handle.dy) * handle.sign * (fine ? 0.1 : 1);
  return Math.max(-max, Math.min(max, value));
}

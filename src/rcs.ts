import * as T from 'three';
// Stable jet indices: -X, +X, -Y, +Y, -Z, +Z (force, opposite to the exhaust).
export const RCS_DIRECTIONS: readonly T.Vector3Tuple[] = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1]
];
/** Local outlet of a six-face block; each bell opens at the centre of its own face. */
export function rcsOutlet(size: readonly number[], direction: T.Vector3Tuple): T.Vector3 {
  return new T.Vector3()
    .fromArray(size)
    .multiply(new T.Vector3(...direction))
    .multiplyScalar(-0.5);
}
export interface RcsThruster {
  id: string;
  index: number;
  position: T.Vector3;
  direction: T.Vector3;
  thrust: number;
  isp: number;
}
export interface RcsJet extends RcsThruster {
  level: number;
  force: T.Vector3;
}
export interface RcsPart {
  id: string;
  type: string;
  p: T.Vector3Tuple;
  r: T.Vector3Tuple;
  fuelEnabled?: boolean;
}
export interface RcsDefinition {
  size: readonly number[];
  rcsThrust?: number;
  rcsIsp?: number;
  readonly [key: string]: unknown;
}

// Bounded least-squares mixer. Unachievable commands remain unachievable: the
// returned forces always act at the actual nozzle positions, never as free torque.
export function mixRCS(
  thrusters: readonly RcsThruster[],
  com: T.Vector3,
  rotation: T.Vector3,
  translation: T.Vector3
): number[] {
  // No command, no jets: with an all-zero command the sweeps below leave every level at exactly 0.
  if (
    translation.x === 0 &&
    translation.y === 0 &&
    translation.z === 0 &&
    rotation.x === 0 &&
    rotation.y === 0 &&
    rotation.z === 0
  )
    return thrusters.map(() => 0);
  const columns = thrusters.map(t => {
    const f = t.direction.clone().multiplyScalar(t.thrust),
      torque = t.position.clone().sub(com).cross(f);
    return [...f.toArray(), ...torque.toArray()];
  });
  const positive = Array<number>(6).fill(0),
    negative = Array<number>(6).fill(0);
  for (const col of columns)
    col.forEach((v, i) => {
      positive[i] += Math.max(0, v);
      negative[i] += Math.max(0, -v);
    });
  const command = [...translation.toArray(), ...rotation.toArray()].map(v => T.MathUtils.clamp(v, -1, 1));
  const scale = positive.map((v, i) => Math.max(v, negative[i], 1));
  const residual = command.map((v, i) => (v * (v >= 0 ? positive[i] : negative[i])) / scale[i]);
  const matrix = columns.map(col => col.map((v, i) => v / scale[i])),
    norms = matrix.map(col => col.reduce((s, v) => s + v * v, 0)),
    levels = thrusters.map(() => 0);
  for (let iteration = 0; iteration < 120; iteration++) {
    let moved = false;
    for (let j = 0; j < matrix.length; j++) {
      const col = matrix[j],
        norm = norms[j];
      if (norm < 1e-12) continue;
      let dot = 0;
      for (let i = 0; i < 6; i++) dot += col[i] * residual[i];
      const next = T.MathUtils.clamp(levels[j] + dot / norm, 0, 1),
        delta = next - levels[j];
      // A level that stays put leaves the residual as it is.
      if (delta === 0) continue;
      moved = true;
      levels[j] = next;
      for (let i = 0; i < 6; i++) residual[i] -= col[i] * delta;
    }
    // A sweep that moved nothing is a fixed point: every later sweep repeats it.
    if (!moved) break;
  }
  // Opposed nozzles can retain a cancelling component in a least-squares
  // solution. Remove only exactly opposite force/torque columns: this keeps
  // the commanded wrench unchanged while avoiding propellant spent on itself.
  for (let i = 0; i < columns.length; i++)
    for (let j = i + 1; j < columns.length; j++) {
      if (!columns[i].every((v, k) => Math.abs(v + columns[j][k]) < 1e-9)) continue;
      const cancelled = Math.min(levels[i], levels[j]);
      levels[i] -= cancelled;
      levels[j] -= cancelled;
    }
  return levels;
}

export function rcsThrusters(
  parts: readonly RcsPart[],
  definitions: Readonly<Record<string, RcsDefinition>>
): RcsThruster[] {
  return parts.flatMap(p => {
    const d = definitions[p.type],
      thrust = d.rcsThrust,
      isp = d.rcsIsp;
    if (!thrust || p.fuelEnabled === false) return [];
    if (isp === undefined) throw Error('RCSの比推力が定義されていません: ' + p.type);
    const q = new T.Quaternion().setFromEuler(new T.Euler(...p.r));
    return RCS_DIRECTIONS.map((direction, index) => ({
      id: p.id,
      index,
      position: rcsOutlet(d.size, direction)
        .applyQuaternion(q)
        .add(new T.Vector3(...p.p)),
      direction: new T.Vector3(...direction).applyQuaternion(q),
      thrust,
      isp
    }));
  });
}

/** The RCS blocks a thruster list was built from, to tell when it must be rebuilt. */
export interface RcsLayout {
  sources: {part: RcsPart; id: string; type: string; p: T.Vector3Tuple; r: T.Vector3Tuple}[];
  thrusters: RcsThruster[];
}
function sameTuple(a: T.Vector3Tuple, b: T.Vector3Tuple): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
/**
 * rcsThrusters, rebuilt only when the supplying RCS blocks change (another part object, id, type, placement
 * or fuel switch). The returned layout replaces the caller's; its thrusters and their vectors are shared
 * between calls and must not be modified.
 */
export function rcsLayout(
  previous: RcsLayout | undefined,
  parts: readonly RcsPart[],
  definitions: Readonly<Record<string, RcsDefinition>>
): RcsLayout {
  if (previous) {
    let k = 0,
      same = true;
    for (const p of parts) {
      if (!definitions[p.type].rcsThrust || p.fuelEnabled === false) continue;
      const s = previous.sources[k++];
      if (
        !s ||
        s.part !== p ||
        s.id !== p.id ||
        s.type !== p.type ||
        !sameTuple(s.p, p.p) ||
        !sameTuple(s.r, p.r)
      ) {
        same = false;
        break;
      }
    }
    if (same && k === previous.sources.length) return previous;
  }
  return {
    sources: parts
      .filter(p => definitions[p.type].rcsThrust && p.fuelEnabled !== false)
      .map(p => ({part: p, id: p.id, type: p.type, p: [...p.p], r: [...p.r]})),
    thrusters: rcsThrusters(parts, definitions)
  };
}

// Internal monopropellant reservoirs supply only their own block. No main-fuel
// crossfeed, and no resource transfer across separated craft.
export function burnRCS(
  thrusters: readonly RcsThruster[],
  levels: readonly number[],
  propellant: Map<string, number>,
  dt: number
): RcsJet[] {
  const needs = new Map<string, number>();
  thrusters.forEach((t, i) =>
    needs.set(t.id, (needs.get(t.id) || 0) + (t.thrust * levels[i] * dt) / (t.isp * 9.81))
  );
  const fractions = new Map<string, number>();
  for (const [id, need] of needs) {
    const available = propellant.get(id) || 0;
    fractions.set(id, need > 0 ? Math.min(1, available / need) : 0);
    propellant.set(id, Math.max(0, available - need));
  }
  return thrusters.map((t, i) => {
    const fraction = fractions.get(t.id);
    if (fraction === undefined) throw Error('RCSの推進剤配分が見つかりません: ' + t.id);
    return {
      ...t,
      level: levels[i] * fraction,
      force: t.direction.clone().multiplyScalar(t.thrust * levels[i] * fraction)
    };
  });
}

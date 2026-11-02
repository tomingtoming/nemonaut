import * as T from 'three';
// Each nozzle's exhaust points opposite its force. Positions are in part-local meters.
export const RCS_NOZZLES = [...Array(3)].flatMap((_, axis) =>
  [-1, 1].map(sign => {
    const direction: T.Vector3Tuple = [0, 0, 0];
    direction[axis] = sign;
    const position: T.Vector3Tuple = [-0.24 * direction[0], -0.24 * direction[1], -0.24 * direction[2]];
    return {direction, position};
  })
);
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
    levels = thrusters.map(() => 0);
  for (let iteration = 0; iteration < 120; iteration++)
    for (let j = 0; j < matrix.length; j++) {
      const col = matrix[j],
        norm = col.reduce((s, v) => s + v * v, 0);
      if (norm < 1e-12) continue;
      const next = T.MathUtils.clamp(
          levels[j] + col.reduce((s, v, i) => s + v * residual[i], 0) / norm,
          0,
          1
        ),
        delta = next - levels[j];
      levels[j] = next;
      col.forEach((v, i) => (residual[i] -= v * delta));
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
    return RCS_NOZZLES.map((n, index) => ({
      id: p.id,
      index,
      position: new T.Vector3(...n.position).applyQuaternion(q).add(new T.Vector3(...p.p)),
      direction: new T.Vector3(...n.direction).applyQuaternion(q),
      thrust,
      isp
    }));
  });
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

import * as T from 'three';
import {PARTS, type Part} from './catalog.js';
import {PRIMARY, MOON, bodyState} from './celestial.js';
export const SUN_DIRECTION = new T.Vector3(12, 24, 12).normalize();
/** The part fields the electric model reads (a catalog Part satisfies it). */
export type PowerPart = Pick<Part, 'id' | 'type' | 'r' | 'reactionEnabled'>;
/** Stored charge (EC) by battery part id. */
export type ChargeMap = Map<string, number>;
/** Pitch/yaw/roll command magnitudes driving reaction-wheel load. */
export interface PowerCommands {
  pitch: number;
  yaw: number;
  roll: number;
}
/** One powerStep result: rates in EC/s, eclipse when the sun is hidden. */
export interface PowerReading {
  stored: number;
  capacity: number;
  generation: number;
  demand: number;
  consumption: number;
  ratio: number;
  eclipse: boolean;
  net: number;
}
export function createCharge(parts: readonly Pick<Part, 'id' | 'type'>[]): ChargeMap {
  return new Map<string, number>(
    parts.flatMap((p): [string, number][] => {
      const battery = PARTS[p.type].battery;
      return battery ? [[p.id, battery]] : [];
    })
  );
}
export function powerTotals(
  parts: readonly Pick<Part, 'id' | 'type'>[],
  charge: ReadonlyMap<string, number>
): {stored: number; capacity: number} {
  return {
    stored: parts.reduce((s, p) => s + (charge.get(p.id) || 0), 0),
    capacity: parts.reduce((s, p) => s + (PARTS[p.type].battery || 0), 0)
  };
}
export function inEclipse(pos: T.Vector3, time = 0): boolean {
  return [PRIMARY, MOON].some(body => {
    const r = pos.clone().sub(bodyState(body, time).position),
      along = r.dot(SUN_DIRECTION);
    return along < 0 && r.lengthSq() - along * along < body.radius ** 2;
  });
}
export function solarGeneration(
  parts: readonly PowerPart[],
  pos: T.Vector3,
  q: T.Quaternion,
  time = 0
): number {
  if (inEclipse(pos, time)) return 0;
  return parts.reduce((sum, p) => {
    const rate = PARTS[p.type].solarPower || 0;
    if (!rate) return sum;
    const normal = new T.Vector3(0, 0, 1).applyEuler(new T.Euler(...p.r)).applyQuaternion(q);
    return sum + rate * Math.max(0, normal.dot(SUN_DIRECTION));
  }, 0);
}
export function powerStep(
  parts: readonly PowerPart[],
  charge: ChargeMap,
  pos: T.Vector3,
  q: T.Quaternion,
  commands: PowerCommands,
  enabled: boolean,
  dt: number,
  time = 0,
  load = 0
): PowerReading {
  const {stored, capacity} = powerTotals(parts, charge),
    generation = solarGeneration(parts, pos, q, time),
    reaction = enabled
      ? parts.reduce((s, p) => s + (p.reactionEnabled === false ? 0 : PARTS[p.type].reactionTorque || 0), 0)
      : 0,
    demand = load + (reaction / 1000) * Math.hypot(commands.pitch, commands.yaw, commands.roll),
    available = stored + generation * dt,
    consumed = Math.min(available, demand * dt),
    ratio = demand > 0 ? Math.min(1, available / (demand * dt)) : 1,
    next = Math.max(0, Math.min(capacity, available - consumed)),
    change = next - stored;
  for (const p of parts) {
    const cap = PARTS[p.type].battery || 0;
    if (!cap) continue;
    const current = charge.get(p.id) || 0,
      share =
        change >= 0
          ? capacity > stored
            ? (cap - current) / (capacity - stored)
            : 0
          : stored
            ? current / stored
            : 0;
    charge.set(p.id, Math.max(0, Math.min(cap, current + change * share)));
  }
  return {
    stored: next,
    capacity,
    generation,
    demand,
    consumption: consumed / dt,
    ratio,
    eclipse: inEclipse(pos, time),
    net: change / dt
  };
}

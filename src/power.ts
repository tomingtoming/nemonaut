import * as T from 'three';
import RAPIER, {sharedPhysics} from './physics.js';

import {PARTS, type Part} from './catalog.js';
import {PRIMARY, MOON, bodyState} from './celestial.js';
await RAPIER.init();
let chargeBuffer: Float64Array | undefined;
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
  const generation = solarGeneration(parts, pos, q, time),
    reaction = enabled
      ? parts.reduce((s, p) => s + (p.reactionEnabled === false ? 0 : PARTS[p.type].reactionTorque || 0), 0)
      : 0,
    demand = load + (reaction / 1000) * Math.hypot(commands.pitch, commands.yaw, commands.roll);
  return {...distributeCharge(parts, charge, generation, demand, dt), eclipse: inEclipse(pos, time)};
}

// One vessel update, shared by fixed physics ticks and adaptive coast steps.
// Geometry, eclipse and actuator demand have already been evaluated by the caller.
export function distributeCharge(
  parts: readonly Pick<Part, 'id' | 'type'>[],
  charge: ChargeMap,
  generation: number,
  demand: number,
  dt: number
): Omit<PowerReading, 'eclipse'> {
  const engine = sharedPhysics();
  if (!engine) throw Error('Rust電力計算を初期化できませんでした');
  const batteries = parts.filter(p => PARTS[p.type].battery);
  const length = 5 + 2 * batteries.length;
  if (!chargeBuffer || chargeBuffer.length !== length || chargeBuffer.buffer !== engine.memory.buffer) {
    const ptr = engine.charge_prepare(batteries.length);
    chargeBuffer = new Float64Array(engine.memory.buffer, ptr, length);
  }
  const buf = chargeBuffer;
  for (const [i, p] of batteries.entries()) {
    buf[5 + 2 * i] = PARTS[p.type].battery ?? 0;
    buf[6 + 2 * i] = charge.get(p.id) ?? 0;
  }
  engine.charge_distribute(generation, demand, dt);
  for (const [i, p] of batteries.entries()) charge.set(p.id, buf[6 + 2 * i]);
  return {
    stored: buf[0],
    capacity: buf[1],
    generation,
    demand,
    consumption: buf[2],
    ratio: buf[3],
    net: buf[4]
  };
}

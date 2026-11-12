import RAPIER, {sharedPhysics} from './physics.js';
import {PARTS, type Part} from './catalog.js';
await RAPIER.init();
/** The part fields resource bookkeeping reads (a catalog Part satisfies it). */
export interface ResourcePart {
  id: string;
  type: string;
  parent?: string | null;
  stage: number;
  fuelLoad?: number;
  thrustLimit?: number;
  fuelCrossfeed?: boolean;
  fuelEnabled?: boolean;
}
/** Remaining propellant (kg) by part id. */
export type FuelMap = Map<string, number>;
/**
 * Parts sharing one propellant supply: every member, its enabled tanks and its non-water engines.
 * tiers is set only when the supply spans a crossfeeding separator with tanks on both sides: the
 * enabled tanks in drain order, the ones behind the most crossfeeding separators (counted from the
 * supply's root) first. Engines empty one tier before they draw on the next.
 */
export interface FuelGroup<P extends ResourcePart = ResourcePart> {
  parts: P[];
  tanks: P[];
  engines: P[];
  tiers?: P[][];
}
/** fuelNetworks result: all groups plus each part's group by id. */
export interface FuelNetworks<P extends ResourcePart = ResourcePart> {
  groups: FuelGroup<P>[];
  network: Map<string, FuelGroup<P>>;
}
/** Ids of the engines that are lit (a Set, or any collection with has). */
export type EngineSet = {has(id: string): boolean};
/** One stagePerformance row (SI units; dv in m/s). */
export interface StagePerformance {
  stage: number;
  thrust: number;
  mass: number;
  seaTwr: number;
  twr: number;
  fuel: number;
  dv: number;
}
/** The current fuel map stores total onboard propellant mass; it includes oxidizer for rockets. */
export function usesTankPropellant(p: Pick<ResourcePart, 'type'>): boolean {
  const source = PARTS[p.type].oxidizerSource;
  return source === 'onboard' || source === 'atmosphere';
}
export const engineMaxThrust = (p: Pick<ResourcePart, 'type' | 'thrustLimit'>): number =>
  (PARTS[p.type].thrust || 0) * (p.thrustLimit ?? 1);
/** The catalog (vacuum) specific impulse of an engine part; every part with thrust defines one. */
export function vacuumIsp(p: Pick<ResourcePart, 'type'>): number {
  const isp = PARTS[p.type].isp;
  if (isp === undefined) throw Error('エンジンの比推力が定義されていません: ' + p.type);
  return isp;
}
export function engineIsp(p: Pick<ResourcePart, 'type'>, pressure = 0): number {
  const d = PARTS[p.type],
    isp = vacuumIsp(p);
  return d.ispSeaLevel === undefined
    ? isp
    : isp + (d.ispSeaLevel - isp) * Math.max(0, Math.min(1, pressure / 101325));
}
export const createFuel = (parts: readonly ResourcePart[]): FuelMap =>
  new Map<string, number>(
    parts.flatMap(p => {
      const capacity = PARTS[p.type].fuel || PARTS[p.type].monoprop;
      return capacity ? [[p.id, capacity * (p.fuelLoad ?? 1)] as const] : [];
    })
  );
export const fuelMass = (
  p: Pick<ResourcePart, 'id' | 'type' | 'fuelLoad'>,
  fuel: FuelMap | number
): number =>
  fuel instanceof Map
    ? fuel.get(p.id) || 0
    : (PARTS[p.type].fuel || PARTS[p.type].monoprop || 0) * fuel * (p.fuelLoad ?? 1);
// A separator blocks the parent edge unless its crossfeed is switched on. Its children share the
// discarded side's fuel.
/** P defaults to the catalog Part so an untyped (`any`) argument still yields catalog parts. */
export function fuelNetworks<P extends ResourcePart = Part>(parts: readonly P[]): FuelNetworks<P> {
  const byId = new Map<string, P>(parts.map(p => [p.id, p])),
    groups = new Map<string, FuelGroup<P>>(),
    network = new Map<string, FuelGroup<P>>(),
    depths = new Map<string, number>();
  for (const p of parts) {
    let root = p,
      depth = 0;
    for (
      let parent = root.parent ? byId.get(root.parent) : undefined;
      parent &&
      !(PARTS[root.type].decoupler && root.fuelCrossfeed !== true) &&
      !(PARTS[root.type].docking && root.fuelCrossfeed === false) &&
      !(PARTS[parent.type].docking && parent.fuelCrossfeed === false);
      parent = root.parent ? byId.get(root.parent) : undefined
    ) {
      if (PARTS[root.type].decoupler) depth++;
      root = parent;
    }
    let group = groups.get(root.id);
    if (!group) {
      group = {parts: [], tanks: [], engines: []};
      groups.set(root.id, group);
    }
    group.parts.push(p);
    if (PARTS[p.type].fuel && p.fuelEnabled !== false) {
      group.tanks.push(p);
      depths.set(p.id, depth);
    }
    if (usesTankPropellant(p)) group.engines.push(p);
    network.set(p.id, group);
  }
  for (const group of groups.values()) {
    const levels = [...new Set(group.tanks.map(t => depths.get(t.id) ?? 0))].sort((a, b) => b - a);
    if (levels.length > 1)
      group.tiers = levels.map(level => group.tanks.filter(t => (depths.get(t.id) ?? 0) === level));
  }
  return {groups: [...groups.values()], network};
}
// Take `drawn` kg from a tiered supply: each tier in turn, shared within a tier in proportion to content.
function drainTiers(tiers: readonly (readonly ResourcePart[])[], fuel: FuelMap, drawn: number): void {
  for (const tier of tiers) {
    const held = tier.reduce((n, t) => n + (fuel.get(t.id) || 0), 0);
    if (held <= 0) continue;
    const left = drawn >= held ? 0 : 1 - drawn / held;
    for (const t of tier) fuel.set(t.id, (fuel.get(t.id) || 0) * left);
    drawn -= held;
    if (drawn <= 0) return;
  }
}
/**
 * The tanks a supply empties while `stage` is current in the sequential reference burn. A tiered
 * supply stops at the tier holding the last fuelled tank that the next separation discarding any of
 * its tanks would take; any other supply burns dry.
 */
export function stageDrain<P extends ResourcePart>(
  group: FuelGroup<P>,
  parts: readonly ResourcePart[],
  fuel: ReadonlyMap<string, number>,
  stage: number
): P[] {
  const tiers = group.tiers;
  if (!tiers) return group.tanks;
  const later = [...new Set(parts.filter(p => p.stage > stage).map(p => p.stage))].sort((a, b) => a - b);
  for (const next of later) {
    const dropped = new Set<string | null | undefined>(
      parts.filter(p => p.parent && PARTS[p.type].decoupler && p.stage === next).map(p => p.id)
    );
    if (!dropped.size) continue;
    let more = true;
    while (more) {
      more = false;
      for (const p of parts)
        if (dropped.has(p.parent) && !dropped.has(p.id)) {
          dropped.add(p.id);
          more = true;
        }
    }
    if (!group.tanks.some(t => dropped.has(t.id))) continue;
    // Tanks about to be discarded that are already empty leave nothing to burn before the separation.
    const last = tiers.findLastIndex(tier => tier.some(t => dropped.has(t.id) && (fuel.get(t.id) || 0) > 0));
    return tiers.slice(0, last + 1).flat();
  }
  return group.tanks;
}
export function engineBurn<P extends ResourcePart>(
  networks: Pick<FuelNetworks<P>, 'groups'>,
  fuel: FuelMap,
  active: EngineSet,
  throttle: number,
  density: number,
  dt: number,
  pressure = (density / 1.225) * 101325,
  intakeExposure?: (engine: P) => number
): Map<string, number> {
  const groups = [];
  let length = 0;
  for (const {engines, tanks, tiers} of networks.groups) {
    const lit = engines.filter(p => active.has(p.id));
    if (!lit.length) continue;
    const exposure = lit.map(p =>
      PARTS[p.type].oxidizerSource === 'atmosphere' ? (intakeExposure?.(p) ?? 1) : 1
    );
    groups.push({lit, tanks, tiers, exposure, start: length});
    length += 2 + lit.length * 5 + tanks.length;
  }
  const thrust = new Map<string, number>();
  if (!length) return thrust;
  const wasm = sharedPhysics();
  if (!wasm) throw Error('Rust燃焼計算を初期化できませんでした');
  const ptr = wasm.fuel_prepare(length);
  const buf = new Float64Array(wasm.memory.buffer, ptr, length);
  for (const {lit, tanks, exposure, start} of groups) {
    let i = start;
    buf[i++] = lit.length;
    buf[i++] = tanks.length;
    for (const [index, p] of lit.entries()) {
      const d = PARTS[p.type],
        air = d.oxidizerSource === 'atmosphere';
      buf[i++] = engineMaxThrust(p);
      const isp = vacuumIsp(p);
      buf[i++] = isp;
      buf[i++] = d.ispSeaLevel ?? isp;
      buf[i++] = Number(air);
      buf[i++] = exposure[index];
    }
    for (const tank of tanks) buf[i++] = fuel.get(tank.id) || 0;
  }
  wasm.fuel_burn_vessel(throttle, density, pressure, dt);
  for (const {lit, tanks, tiers, start} of groups) {
    let i = start + 2;
    for (const p of lit) {
      thrust.set(p.id, buf[i]);
      i += 5;
    }
    if (!buf[start]) continue;
    if (!tiers) for (const p of tanks) fuel.set(p.id, buf[i++]);
    else {
      // The kernel sizes the draw and the delivered thrust from the whole supply; only the split
      // between tanks differs, so one step can finish a tier and start the next without a gap.
      let before = 0,
        after = 0;
      for (const p of tanks) {
        before += fuel.get(p.id) || 0;
        after += buf[i++];
      }
      drainTiers(tiers, fuel, before - after);
    }
  }
  return thrust;
}
// Sequential reference burn: vacuum Isp, no gravity/drag losses, burn connected tanks dry before next stage
// (a crossfeeding supply: only as far as the tanks the next separation discards, see stageDrain).
export function stagePerformance(
  parts: readonly ResourcePart[],
  fuel: ReadonlyMap<string, number> = createFuel(parts),
  thermal: ReadonlyMap<string, {ablator?: number}> | null = null
): StagePerformance[] {
  let remaining = structuredClone(parts),
    propellant = new Map<string, number>(fuel),
    active = new Set<string>();
  const plan: StagePerformance[] = [];
  for (const stage of [...new Set<number>(parts.map(p => p.stage))].sort((a, b) => a - b)) {
    const removed = new Set<string | null | undefined>(
      remaining.filter(p => p.parent && PARTS[p.type].decoupler && p.stage === stage).map(p => p.id)
    );
    let more = true;
    while (more) {
      more = false;
      for (const p of remaining)
        if (removed.has(p.parent) && !removed.has(p.id)) {
          removed.add(p.id);
          more = true;
        }
    }
    remaining = remaining.filter(p => !removed.has(p.id));
    for (const p of remaining) if (p.stage === stage && usesTankPropellant(p)) active.add(p.id);
    const networks = fuelNetworks(remaining),
      burning = networks.groups.filter(
        g =>
          g.engines.some(e => active.has(e.id) && engineMaxThrust(e) > 0) &&
          g.tanks.some(t => (propellant.get(t.id) || 0) > 0)
      ),
      engines = burning.flatMap(g => g.engines.filter(e => active.has(e.id) && engineMaxThrust(e) > 0)),
      thrust = engines.reduce((s, p) => s + engineMaxThrust(p), 0);
    if (!thrust) continue;
    const before = remaining.reduce(
        (s, p) =>
          s +
          PARTS[p.type].mass +
          (propellant.get(p.id) || 0) +
          (thermal?.get(p.id)?.ablator ?? PARTS[p.type].ablator ?? 0),
        0
      ),
      drained = burning.map(g => stageDrain(g, remaining, propellant, stage)),
      fuel = drained.reduce((s, tanks) => s + tanks.reduce((n, p) => n + (propellant.get(p.id) || 0), 0), 0),
      isp = thrust / engines.reduce((s, p) => s + engineMaxThrust(p) / vacuumIsp(p), 0);
    plan.push({
      stage,
      thrust,
      mass: before,
      seaTwr:
        engines.reduce((s, p) => s + (engineMaxThrust(p) * engineIsp(p, 101325)) / vacuumIsp(p), 0) /
        (before * 9.81),
      twr: thrust / (before * 9.81),
      fuel,
      dv: isp * 9.81 * Math.log(before / Math.max(1, before - fuel))
    });
    for (const tanks of drained) for (const p of tanks) propellant.set(p.id, 0);
  }
  return plan;
}

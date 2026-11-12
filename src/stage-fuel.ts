import {PARTS} from './catalog.js';
import {createFuel, usesTankPropellant, fuelNetworks, type ResourcePart} from './resources.js';
/** One stage's engines and the propellant currently connected to them (kg). */
export interface StageFuelLevel {
  engines: string[];
  unfed: number;
  capacity: number;
  remaining: number;
}
// Fuel networks list only parts with a fuel capacity as tanks.
function tankCapacity(t: ResourcePart): number {
  const fuel = PARTS[t.type].fuel;
  if (fuel === undefined) throw Error('燃料タンクの容量が定義されていません');
  return fuel;
}
// Current connected propellant, not a forecast of fuel left after earlier stages.
export function stageFuelLevels(
  parts: readonly ResourcePart[],
  fuel: ReadonlyMap<string, number> = createFuel(parts)
): Map<number, StageFuelLevel> {
  const networks = fuelNetworks(parts),
    levels = new Map<number, {tanks: Map<string, ResourcePart>; engines: string[]; unfed: number}>();
  for (const p of parts) {
    if (!usesTankPropellant(p)) continue;
    let level = levels.get(p.stage);
    if (!level) {
      level = {tanks: new Map<string, ResourcePart>(), engines: [], unfed: 0};
      levels.set(p.stage, level);
    }
    const network = networks.network.get(p.id);
    if (!network) throw Error('エンジンの燃料系統が見つかりません');
    const tanks = network.tanks;
    level.engines.push(p.id);
    if (!tanks.some(t => (fuel.get(t.id) || 0) > 0)) level.unfed++;
    for (const t of tanks) level.tanks.set(t.id, t);
  }
  return new Map<number, StageFuelLevel>(
    [...levels].map(([stage, level]): [number, StageFuelLevel] => [
      stage,
      {
        engines: level.engines,
        unfed: level.unfed,
        capacity: [...level.tanks.values()].reduce((n, t) => n + tankCapacity(t), 0),
        remaining: [...level.tanks.keys()].reduce((n, id) => n + (fuel.get(id) || 0), 0)
      }
    ])
  );
}
/** The propellant (kg) in the tanks a stage's crossfeeding separators discard. */
export interface SeparationFuelLevel {
  capacity: number;
  remaining: number;
}
// With crossfeed the outer tanks empty first, so these levels tell when a separation costs no fuel.
// Only enabled tanks of the supply the separator passes fuel into are counted.
export function separationFuelLevels(
  parts: readonly ResourcePart[],
  fuel: ReadonlyMap<string, number> = createFuel(parts)
): Map<number, SeparationFuelLevel> {
  const levels = new Map<number, Map<string, ResourcePart>>();
  if (!parts.some(p => PARTS[p.type].decoupler && p.fuelCrossfeed === true)) return new Map();
  const networks = fuelNetworks(parts),
    byId = new Map(parts.map(p => [p.id, p]));
  for (const tank of networks.groups.flatMap(g => (g.tiers ? g.tanks : []))) {
    const supply = networks.network.get(tank.id);
    for (
      let p: ResourcePart | undefined = tank;
      p?.parent && networks.network.get(p.parent) === supply;
      p = byId.get(p.parent)
    ) {
      if (!PARTS[p.type].decoupler) continue;
      let level = levels.get(p.stage);
      if (!level) {
        level = new Map<string, ResourcePart>();
        levels.set(p.stage, level);
      }
      level.set(tank.id, tank);
    }
  }
  return new Map<number, SeparationFuelLevel>(
    [...levels].map(([stage, tanks]): [number, SeparationFuelLevel] => [
      stage,
      {
        capacity: [...tanks.values()].reduce((n, t) => n + tankCapacity(t), 0),
        remaining: [...tanks.keys()].reduce((n, id) => n + (fuel.get(id) || 0), 0)
      }
    ])
  );
}
/** True when the stage after `stage` discards crossfeeding tanks and all of them are empty. */
export function separationDue(
  parts: readonly ResourcePart[],
  fuel: ReadonlyMap<string, number>,
  stage: number
): boolean {
  const level = separationFuelLevels(parts, fuel).get(stage + 1);
  return !!level && level.remaining < 0.001;
}

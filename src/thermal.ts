import * as T from 'three';
import {PARTS, type PartDefinition, type Part} from './catalog.js';
/** Per-part thermal state, mutated in place by thermalStep. Temperatures in K, ablator in kg. */
export interface ThermalState {
  temperature: number;
  ablator: number;
  failed: boolean;
}
/** Thermal state by part id. */
export type ThermalMap = Map<string, ThermalState>;
/** The part fields the thermal model reads (a catalog Part satisfies it). */
export type ThermalPart = Pick<Part, 'id' | 'type' | 'p' | 'r'>;
/** Free-stream air: density kg/m³, static temperature K. */
export interface ThermalAir {
  density: number;
  temperature: number;
}
/** One part's thermalStep reading; heat/loss in W. */
export interface ThermalReading {
  temperature: number;
  limit: number;
  flux: number;
  shielded: boolean;
  heat: number;
  loss: number;
  ablated: number;
  failed: boolean;
}
/** The part closest to its temperature limit (ratio = temperature/limit). */
export interface ThermalHotspot {
  id: string;
  temperature: number;
  ratio: number;
}
export interface ThermalStepResult {
  parts: Map<string, ThermalReading>;
  hottest: ThermalHotspot | null;
  consumed: number;
  failed: string[];
}
/** A catalog definition plus the optional per-part ablation overrides the thermal model honours. */
export type ThermalDefinition = PartDefinition & {ablationTemperature?: number; ablatorEnergy?: number};
/** Part definitions by type, as thermal functions accept them (PARTS by default). */
export type ThermalCatalog = Record<string, ThermalDefinition>;
interface PartGeometry {
  p: ThermalPart;
  d: ThermalDefinition;
  rotation: T.Quaternion;
  center: T.Vector3;
}

// Gameplay approximation of Sutton–Graves scaling, SI units (W/m²).
// Reference: https://ntrs.nasa.gov/citations/19720003329
// Coefficient, material properties and wake attenuation are game parameters,
// not a validated Earth/Kerbin aerothermal or material database.
export const THERMAL = {
  coefficient: 1.74e-4,
  sigma: 5.670374419e-8,
  heatCapacity: 900,
  emissivity: 0.8,
  maxTemperature: 1100,
  ablatorEnergy: 2e7,
  ablationTemperature: 650,
  wakeTransmission: 0.025
};
export function stagnationFlux(density: number, speed: number, radius: number): number {
  return (
    THERMAL.coefficient * Math.sqrt(Math.max(0, density) / Math.max(0.05, radius)) * Math.max(0, speed) ** 3
  );
}
export function createThermal(
  parts: readonly Pick<Part, 'id' | 'type'>[],
  definitions: ThermalCatalog = PARTS
): ThermalMap {
  return new Map<string, ThermalState>(
    parts.map(p => [p.id, {temperature: 288.15, ablator: definitions[p.type].ablator || 0, failed: false}])
  );
}
function geometry(p: ThermalPart, q: T.Quaternion, definitions: ThermalCatalog): PartGeometry {
  const d = definitions[p.type],
    rotation = q.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(...p.r))),
    center = new T.Vector3(...(d.massCenter || [0, 0, 0]))
      .applyQuaternion(rotation)
      .add(new T.Vector3(...p.p).applyQuaternion(q));
  return {p, d, rotation, center};
}
function projectedArea(g: PartGeometry, direction: T.Vector3): number {
  const v = direction.clone().applyQuaternion(g.rotation.clone().invert()),
    [x, y, z] = g.d.size;
  return Math.abs(v.x) * y * z + Math.abs(v.y) * x * z + Math.abs(v.z) * x * y;
}
// The whole bounding box must fit inside the projected shield disk. This is
// deliberately conservative: a shield cannot protect a large part by covering
// only its centre. Offset, rotation and shielding direction all matter.
export function shieldCoverage(
  part: ThermalPart,
  shield: ThermalPart,
  direction: T.Vector3,
  q = new T.Quaternion(),
  definitions: ThermalCatalog = PARTS
): boolean {
  const g = geometry(part, q, definitions),
    s = geometry(shield, q, definitions);
  if (!s.d.heatShield || part.id === shield.id) return false;
  const n = new T.Vector3(...(s.d.shieldNormal || [0, -1, 0])).applyQuaternion(s.rotation),
    incidence = n.dot(direction);
  if (incidence < 0.5) return false;
  const face = s.center.clone().addScaledVector(n, s.d.size[1] / 2),
    [x, y, z] = g.d.size;
  for (const a of [-1, 1])
    for (const b of [-1, 1])
      for (const c of [-1, 1]) {
        const corner = new T.Vector3((a * x) / 2, (b * y) / 2, (c * z) / 2)
            .applyQuaternion(g.rotation)
            .add(g.center),
          distance = face.clone().sub(corner).dot(n) / incidence;
        if (distance < 0) return false;
        const hit = corner.addScaledVector(direction, distance);
        if (hit.distanceToSquared(face) > (s.d.shieldRadius || s.d.size[0] / 2) ** 2) return false;
      }
  return true;
}
export function thermalStep(
  parts: readonly ThermalPart[],
  states: ReadonlyMap<string, ThermalState>,
  q: T.Quaternion,
  velocity: T.Vector3,
  air: ThermalAir,
  dt: number,
  definitions: ThermalCatalog = PARTS
): ThermalStepResult {
  if (!Number.isFinite(dt) || dt <= 0) throw Error('Thermal step requires a positive finite duration');
  const speed = velocity.length(),
    direction = speed ? velocity.clone().divideScalar(speed) : new T.Vector3(0, 1, 0),
    geometries = parts.map(p => geometry(p, q, definitions)),
    shields = parts.filter(p => definitions[p.type].heatShield && !states.get(p.id)?.failed),
    readings = new Map<string, ThermalReading>();
  let hottest: ThermalHotspot | null = null,
    consumed = 0;
  // Radiation is integrated in short steps and capped at equilibrium, avoiding
  // negative temperatures on a long step without creating cooling energy.
  const count = Math.ceil(dt / 0.05),
    h = dt / count;
  for (const g of geometries) {
    const {p, d} = g,
      state = states.get(p.id);
    if (!state) throw Error('Missing thermal state: ' + p.id);
    const area = projectedArea(g, direction),
      surface = 2 * (d.size[0] * d.size[1] + d.size[1] * d.size[2] + d.size[0] * d.size[2]),
      shielded = shields.some(s => shieldCoverage(p, s, direction, q, definitions)),
      flux = stagnationFlux(air.density, speed, d.noseRadius || Math.min(...d.size) / 2),
      transmission = shielded ? THERMAL.wakeTransmission : 1,
      capacity = Math.max(1, d.mass) * (d.heatCapacity || THERMAL.heatCapacity),
      ambient = air.density > 1e-9 ? air.temperature : 3;
    let incoming = 0,
      radiated = 0,
      ablated = 0;
    for (let i = 0; i < count; i++) {
      // Cold-wall heat flux tapers at the perfect-gas recovery temperature.
      const recovery = air.temperature + (speed * speed) / (2 * 1005),
        hotWall = Math.max(
          0,
          1 - (state.temperature - air.temperature) / Math.max(1, recovery - air.temperature)
        ),
        heat = flux * area * transmission * hotWall;
      const radiation =
          (d.emissivity || THERMAL.emissivity) *
          THERMAL.sigma *
          surface *
          (state.temperature ** 4 - ambient ** 4),
        convection = air.density * 10 * surface * (state.temperature - air.temperature),
        loss = radiation + convection;
      let energy = (heat - loss) * h;
      const ablativeFace =
        d.heatShield &&
        new T.Vector3(...(d.shieldNormal || [0, -1, 0])).applyQuaternion(g.rotation).dot(direction) > 0.5;
      if (ablativeFace && state.ablator > 0 && energy > 0) {
        const sensible =
            Math.max(0, (d.ablationTemperature || THERMAL.ablationTemperature) - state.temperature) *
            capacity,
          available = Math.max(0, energy - sensible),
          burn = Math.min(state.ablator, available / (d.ablatorEnergy || THERMAL.ablatorEnergy));
        state.ablator -= burn;
        ablated += burn;
        energy -= burn * (d.ablatorEnergy || THERMAL.ablatorEnergy);
      }
      state.temperature = Math.max(
        Math.min(ambient, state.temperature),
        state.temperature + energy / capacity
      );
      if (state.temperature > (d.maxTemperature || THERMAL.maxTemperature)) state.failed = true;
      incoming += heat * h;
      radiated += loss * h;
    }
    consumed += ablated;
    const reading = {
      temperature: state.temperature,
      limit: d.maxTemperature || THERMAL.maxTemperature,
      flux,
      shielded,
      heat: incoming / dt,
      loss: radiated / dt,
      ablated,
      failed: state.failed
    };
    readings.set(p.id, reading);
    if (!hottest || reading.temperature / reading.limit > hottest.ratio)
      hottest = {id: p.id, temperature: reading.temperature, ratio: reading.temperature / reading.limit};
  }
  return {
    parts: readings,
    hottest,
    consumed,
    failed: [...states].filter(([, s]) => s.failed).map(([id]) => id)
  };
}

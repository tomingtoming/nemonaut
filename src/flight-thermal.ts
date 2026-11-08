import * as T from 'three';
import {PARTS} from './catalog.js';
import {partPointToVessel, partRotation} from './part-frame.js';
import type {World} from './physics.js';
import {
  THERMAL,
  type ThermalAir,
  type ThermalDefinition,
  type ThermalHotspot,
  type ThermalMap,
  type ThermalPart,
  type ThermalReading,
  type ThermalStepResult
} from './thermal.js';

function register(parts: readonly ThermalPart[], wasm: World['exports']) {
  const ptr = wasm.thermal_register(parts.length);
  const config = new Float64Array(wasm.memory.buffer, ptr, parts.length * 47);
  for (const [i, p] of parts.entries()) {
    const d: ThermalDefinition = PARTS[p.type],
      [x, y, z] = d.size,
      rotation = partRotation(p);
    const center = partPointToVessel(p, d.massCenter || [0, 0, 0]);
    const row = [];
    for (const a of [-1, 1])
      for (const b of [-1, 1])
        for (const c of [-1, 1])
          row.push(
            ...new T.Vector3((a * x) / 2, (b * y) / 2, (c * z) / 2)
              .applyQuaternion(rotation)
              .add(center)
              .toArray()
          );
    for (const axis of [
      [y * z, 0, 0],
      [0, x * z, 0],
      [0, 0, x * y]
    ])
      row.push(...new T.Vector3(axis[0], axis[1], axis[2]).applyQuaternion(rotation).toArray());
    const normal = new T.Vector3(...(d.shieldNormal || [0, -1, 0])).applyQuaternion(rotation);
    row.push(
      ...center
        .clone()
        .addScaledVector(normal, y / 2)
        .toArray(),
      ...normal.toArray(),
      d.heatShield ? d.shieldRadius || x / 2 : 0,
      2 * (x * y + y * z + z * x),
      Math.max(1, d.mass) * (d.heatCapacity || THERMAL.heatCapacity),
      d.emissivity || THERMAL.emissivity,
      d.noseRadius || Math.min(x, y, z) / 2,
      d.maxTemperature || THERMAL.maxTemperature,
      d.ablationTemperature || THERMAL.ablationTemperature,
      d.ablatorEnergy || THERMAL.ablatorEnergy
    );

    config.set(row, i * 47);
  }
  const statePtr = wasm.thermal_states();
  const length = parts.length * 8;
  const view = () => new Float64Array(wasm.memory.buffer, statePtr, length);
  return (
    currentParts: readonly ThermalPart[],
    state: ThermalMap,
    q: T.Quaternion,
    v: T.Vector3,
    air: ThermalAir,
    dt: number
  ): ThermalStepResult => {
    const input = view();
    for (const [i, p] of currentParts.entries()) {
      const s = state.get(p.id);
      if (!s) throw Error('Missing thermal state: ' + p.id);
      input[i * 8] = s.temperature;
      input[i * 8 + 1] = s.ablator;
      input[i * 8 + 2] = Number(s.failed);
    }
    const speed = v.length(),
      dir = (speed ? v.clone().divideScalar(speed) : new T.Vector3(0, 1, 0)).applyQuaternion(
        q.clone().invert()
      );
    wasm.thermal_step(dir.x, dir.y, dir.z, speed, air.density, air.temperature, dt);
    const output = view(),
      readings = new Map<string, ThermalReading>();
    let hottest: ThermalHotspot | null = null,
      consumed = 0;
    for (const [i, p] of currentParts.entries()) {
      const offset = i * 8,
        s = state.get(p.id);
      if (!s) throw Error('Missing thermal state: ' + p.id);
      s.temperature = output[offset];
      s.ablator = output[offset + 1];
      s.failed = Boolean(output[offset + 2]);
      const limit = PARTS[p.type].maxTemperature || THERMAL.maxTemperature;
      const r = {
        temperature: s.temperature,
        limit,
        failed: s.failed,
        shielded: Boolean(output[offset + 3]),
        flux: output[offset + 4],
        heat: output[offset + 5],
        loss: output[offset + 6],
        ablated: output[offset + 7]
      };
      readings.set(p.id, r);
      consumed += r.ablated;
      const ratio = s.temperature / limit;
      if (!hottest || ratio > hottest.ratio) hottest = {id: p.id, temperature: s.temperature, ratio};
    }
    return {
      parts: readings,
      hottest,
      consumed,
      failed: [...state].filter(([, s]) => s.failed).map(([id]) => id)
    };
  };
}
type Shape = {
  id: string;
  type: string;
  position: number[];
  rotation: number[];
  definition: (typeof PARTS)[string];
};
const registrations = new WeakMap<World, {shape: Shape[]; run: ReturnType<typeof register>}>();
export function forgetThermalShape(world: World) {
  registrations.delete(world);
}

export function flightThermalStep(
  world: World,
  parts: readonly ThermalPart[],
  state: ThermalMap,
  q: T.Quaternion,
  v: T.Vector3,
  air: ThermalAir,
  dt: number
) {
  if (!Number.isFinite(dt) || dt <= 0) throw Error('Thermal step requires a positive finite duration');
  let entry = registrations.get(world);
  if (!entry || !sameShape(entry.shape, parts)) {
    const shape = parts.map(p => ({
      id: p.id,
      type: p.type,
      position: [...p.p],
      rotation: [...p.r],
      definition: PARTS[p.type]
    }));
    entry = {shape, run: register(parts, world.exports)};
    registrations.set(world, entry);
  }
  return entry.run(parts, state, q, v, air, dt);
}
function sameShape(shape: Shape[], parts: readonly ThermalPart[]) {
  return (
    shape.length === parts.length &&
    parts.every((p, i) => {
      const s = shape[i];
      return (
        p.id === s.id &&
        p.type === s.type &&
        PARTS[p.type] === s.definition &&
        p.p.every((x, j) => x === s.position[j]) &&
        p.r.every((x, j) => x === s.rotation[j])
      );
    })
  );
}

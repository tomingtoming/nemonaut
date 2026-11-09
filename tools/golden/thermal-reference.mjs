// Pre-migration thermal model for differential tests.
import * as T from 'three';
import {partPointToVessel} from '../../dist/part-frame.js';
import {PARTS} from '../../dist/catalog.js';
// Sutton–Graves scaling with game material and wake parameters (SI units).
// https://ntrs.nasa.gov/citations/19720003329
const THERMAL = {
  coefficient: 174e-6,
  sigma: 5670374419e-17,
  heatCapacity: 900,
  emissivity: 0.8,
  maxTemperature: 1100,
  ablatorEnergy: 2e7,
  ablationTemperature: 650,
  wakeTransmission: 0.025
};
function stagnationFlux(density, speed, radius) {
  return (
    THERMAL.coefficient * Math.sqrt(Math.max(0, density) / Math.max(0.05, radius)) * Math.max(0, speed) ** 3
  );
}
function geometry(p, q, definitions) {
  const d = definitions[p.type],
    rotation = q.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(...p.r))),
    center = partPointToVessel(p, d.massCenter || [0, 0, 0]).applyQuaternion(q);
  return {p, d, rotation, center};
}
function projectedArea(g, direction) {
  const v = direction.clone().applyQuaternion(g.rotation.clone().invert()),
    [x, y, z] = g.d.size;
  return Math.abs(v.x) * y * z + Math.abs(v.y) * x * z + Math.abs(v.z) * x * y;
}
function shieldCoverage(part, shield, direction, q = new T.Quaternion(), definitions = PARTS) {
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
function thermalStep(parts, states, q, velocity, air, dt, definitions = PARTS) {
  if (!Number.isFinite(dt) || dt <= 0) throw Error('Thermal step requires a positive finite duration');
  const speed = velocity.length(),
    direction = speed ? velocity.clone().divideScalar(speed) : new T.Vector3(0, 1, 0),
    geometries = parts.map(p => geometry(p, q, definitions)),
    shields = parts.filter(p => definitions[p.type].heatShield && !states.get(p.id)?.failed),
    readings = /* @__PURE__ */ new Map();
  let hottest = null,
    consumed = 0;
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
export {shieldCoverage, stagnationFlux, thermalStep};

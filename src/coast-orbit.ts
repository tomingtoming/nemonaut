import RAPIER, {sharedPhysics} from './physics.js';
import * as T from 'three';
import {MOON, MOON_RATE, bodyState, relativeMotion} from './celestial.js';

await RAPIER.init();

export interface StumpffValues {
  c: number;
  s: number;
}
export type CoastLimitReason = 'surface' | 'maneuver' | 'soi';
export interface CoastStepLimit {
  dt: number;
  reason: CoastLimitReason | null;
}
export interface CoastStepLimitOptions {
  requested?: number;
  deadline?: number;
  margin?: number;
  surfaceMargin?: number;
}

export function stumpff(z: number): StumpffValues {
  if (Math.abs(z) < 0.01) {
    let c = 0.5,
      s = 1 / 6,
      ct = c,
      st = s;
    for (let k = 1; k < 12; k++) {
      ct *= -z / ((2 * k + 1) * (2 * k + 2));
      st *= -z / ((2 * k + 2) * (2 * k + 3));
      c += ct;
      s += st;
    }
    return {c, s};
  }
  if (z > 0) {
    const x = Math.sqrt(z);
    return {c: (1 - Math.cos(x)) / z, s: (x - Math.sin(x)) / (x * x * x)};
  }
  const x = Math.sqrt(-z);
  return {c: (Math.cosh(x) - 1) / -z, s: (Math.sinh(x) - x) / (x * x * x)};
}

// Universal-variable two-body propagation. The caller must split at force,
// atmosphere and reference-body changes; this function never crosses those
// boundaries on behalf of the caller. Inputs and the epoch are not mutated.
export function keplerDrift(
  position: T.Vector3,
  velocity: T.Vector3,
  mu: number,
  dt: number
): import('./celestial.js').BodyState {
  const wasm = sharedPhysics();
  if (!wasm) throw Error('Rust物理エンジンを読み込めません');
  const address = wasm.kepler_drift(
    position.x,
    position.y,
    position.z,
    velocity.x,
    velocity.y,
    velocity.z,
    mu,
    dt
  );
  switch (address) {
    case -1:
      throw Error('惰性飛行の条件が不正です');
    case -2:
      throw Error('惰性飛行の解を囲めません');
    case -3:
      throw Error('惰性飛行の計算が収束しません');
    case -4:
      throw Error('惰性飛行の結果が不正です');
  }
  const result = new Float64Array(wasm.memory.buffer, address, 6);
  return {position: new T.Vector3().fromArray(result), velocity: new T.Vector3().fromArray(result, 3)};
}

export function coastDrift(
  position: T.Vector3,
  velocity: T.Vector3,
  time: number,
  dt: number
): import('./celestial.js').BodyState {
  const local = relativeMotion(position, velocity, time),
    next = keplerDrift(local.r, local.velocity, local.body.mu, dt),
    end = bodyState(local.body, time + dt);
  return {position: next.position.add(end.position), velocity: next.velocity.add(end.velocity)};
}

// A conservative travel-distance bound: speed*t + accelerationBound*t²/2.
// Stop outside the boundary margin and hand back to normal physics. Taking
// half the safe interval keeps curvature/approach sampling away from a crossing.
function travelTime(clearance: number, speed: number, acceleration: number): number {
  return (2 * clearance) / (speed + Math.sqrt(speed * speed + 2 * acceleration * clearance));
}
export function coastStepLimit(
  position: T.Vector3,
  velocity: T.Vector3,
  time: number,
  {requested = 30, deadline = Infinity, margin = 1000, surfaceMargin = margin}: CoastStepLimitOptions = {}
): CoastStepLimit {
  if (
    ![...position.toArray(), ...velocity.toArray(), time, requested, margin, surfaceMargin].every(
      Number.isFinite
    ) ||
    time < 0 ||
    requested <= 0 ||
    margin <= 0 ||
    surfaceMargin < margin ||
    !(Number.isFinite(deadline) || deadline === Infinity)
  )
    throw Error('時間加速の条件が不正です');
  const local = relativeMotion(position, velocity, time),
    surface = local.body.radius + Math.max(1000, local.body.atmosphereTop),
    clearance = local.r.length() - surface - surfaceMargin;
  if (clearance <= 0) return {dt: 0, reason: 'surface'};
  if (deadline - time <= 15) return {dt: 0, reason: 'maneuver'};
  const moon = bodyState(MOON, time),
    moonDistance = position.distanceTo(moon.position),
    soiClearance = Math.abs(moonDistance - MOON.sphereOfInfluence) - margin;
  if (soiClearance <= 0) return {dt: 0, reason: 'soi'};
  const gravityBound = local.body.mu / (surface * surface),
    moonAcceleration = MOON.orbitRadius * MOON_RATE ** 2;
  const surfaceTime = travelTime(clearance, local.velocity.length(), gravityBound) * 0.5;
  const soiTime =
    travelTime(soiClearance, velocity.clone().sub(moon.velocity).length(), gravityBound + moonAcceleration) *
    0.5;
  const bounds: CoastStepLimit[] = [
    {dt: requested, reason: null},
    {dt: 30, reason: null},
    {dt: deadline - time - 15, reason: 'maneuver'},
    {dt: surfaceTime, reason: 'surface'},
    {dt: soiTime, reason: 'soi'}
  ];
  return bounds.reduce((a, b) => (b.dt < a.dt ? b : a));
}

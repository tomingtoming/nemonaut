import * as T from 'three';
import {MOON, MOON_RATE, bodyState, relativeMotion} from './celestial.js';

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
  if (
    ![...position.toArray(), ...velocity.toArray(), mu, dt].every(Number.isFinite) ||
    mu <= 0 ||
    position.length() <= 0
  )
    throw Error('惰性飛行の条件が不正です');
  if (dt === 0) return {position: position.clone(), velocity: velocity.clone()};
  const r0 = position.length(),
    root = Math.sqrt(mu),
    rv = position.dot(velocity) / root,
    alpha = 2 / r0 - velocity.lengthSq() / mu;
  const equation = (x: number) => {
    const z = alpha * x * x,
      {c, s} = stumpff(z);
    return {
      value: rv * x * x * c + (1 - alpha * r0) * x * x * x * s + r0 * x - root * dt,
      derivative: rv * x * (1 - z * s) + (1 - alpha * r0) * x * x * c + r0,
      c,
      s
    };
  };
  let lo = 0,
    hi = Math.max(1, (root * Math.abs(dt)) / r0);
  if (dt < 0) {
    lo = -hi;
    hi = 0;
  }
  let bracketed = false;
  for (let i = 0; i < 128; i++) {
    if (equation(lo).value <= 0 && equation(hi).value >= 0) {
      bracketed = true;
      break;
    }
    if (dt > 0) hi *= 2;
    else lo *= 2;
  }
  if (!bracketed) throw Error('惰性飛行の解を囲めません');
  let x = (lo + hi) / 2,
    solved = false;
  for (let i = 0; i < 128; i++) {
    const e = equation(x);
    if (Math.abs(e.value) / root < 1e-12 * Math.max(1, Math.abs(dt))) {
      solved = true;
      break;
    }
    if (e.value > 0) hi = x;
    else lo = x;
    const candidate = x - e.value / e.derivative;
    x = Number.isFinite(candidate) && candidate > lo && candidate < hi ? candidate : (lo + hi) / 2;
  }
  if (!solved) throw Error('惰性飛行の計算が収束しません');
  const {c, s} = stumpff(alpha * x * x),
    f = 1 - (x * x * c) / r0,
    g = dt - (x * x * x * s) / root;
  const p = position.clone().multiplyScalar(f).addScaledVector(velocity, g),
    r = p.length();
  const fdot = (root / (r * r0)) * (alpha * x * x * x * s - x),
    gdot = 1 - (x * x * c) / r;
  const v = position.clone().multiplyScalar(fdot).addScaledVector(velocity, gdot);
  if (![...p.toArray(), ...v.toArray()].every(Number.isFinite)) throw Error('惰性飛行の結果が不正です');
  return {position: p, velocity: v};
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

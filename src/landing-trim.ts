// Longitudinal trim for the approach: the steady speed, angle of attack, elevator and throttle on a
// 3° descent, searched over speed. An estimate, not an admission or safety guarantee.
import * as T from 'three';
import {PARTS} from './catalog.js';
import {partRotation, partCenter, aeroPoint, surfaceForce, controlDeflection} from './aero.js';
import {engineMaxThrust, fuelNetworks} from './resources.js';
import {bodyDrag, type BodyAerodynamics} from './body-drag.js';
import type {ControlPart} from './aero.js';
import type {ResourcePart, EngineSet} from './resources.js';
export interface LandingTrimFlight {
  bodyAerodynamics: BodyAerodynamics;
  parts: readonly (ControlPart & ResourcePart)[];
  stats: {mass: number; com: T.Vector3};
  fuel: ReadonlyMap<string, number>;
  active: EngineSet;
}
export interface TrimAir {
  density?: number;
  gravity?: number;
}
export interface TrimPoint extends TrimAir {
  speed: number;
  alpha: number;
  slope?: number;
}
export interface TrimForces {
  speed: number;
  alpha: number;
  pitchCommand: number;
  throttle: number;
  stalled: boolean;
  liftError: number;
  pitchTorque: number;
}
export interface LandingPlan extends TrimForces {
  minimumSample: number;
  density: number;
  gravity: number;
  mass: number;
}
const rad = Math.PI / 180;
export function planLandingTrim(
  f: LandingTrimFlight,
  {density = 1.225, gravity = 9.81}: TrimAir = {}
): LandingPlan | null {
  // Bounded diagnostic search with 20% elevator travel held in reserve by
  // landingTrim. The additional speed margin is a candidate for flight testing.
  for (let speed = 40; speed <= 160; speed += 2) {
    if (!landingTrim(f, {speed, density, gravity})) continue;
    const selected = landingTrim(f, {speed: speed * 1.05, density, gravity});
    if (selected) return {...selected, minimumSample: speed, density, gravity, mass: f.stats.mass};
  }
  return null;
}
export function trimForces(
  f: LandingTrimFlight,
  {
    speed,
    alpha,
    pitchCommand,
    density = 1.225,
    gravity = 9.81,
    slope = -3
  }: TrimPoint & {pitchCommand: number}
): TrimForces {
  const flow = new T.Vector3(0, -Math.sin(alpha * rad), Math.cos(alpha * rad)),
    velocity = flow.clone().multiplyScalar(speed);
  const pitch = (alpha + slope) * rad,
    up = new T.Vector3(0, Math.cos(pitch), Math.sin(pitch));
  const force = bodyDrag(f.bodyAerodynamics, new T.Quaternion(), velocity, density).force,
    torque = new T.Vector3();
  let stalled = false;
  for (const p of f.parts) {
    if (!PARTS[p.type].wing) continue;
    const a = surfaceForce(
      p,
      partRotation(p),
      velocity,
      density,
      controlDeflection(p, f.stats.com, {pitch: pitchCommand})
    );
    force.add(a.force);
    torque.add(aeroPoint(p).sub(f.stats.com).cross(a.force));
    stalled ||= a.stalled;
  }
  const thrust = new T.Vector3(),
    thrustTorque = new T.Vector3();
  for (const group of fuelNetworks(f.parts).groups) {
    if (!group.tanks.some(p => (f.fuel.get(p.id) || 0) > 0)) continue;
    for (const p of group.engines) {
      if (PARTS[p.type].thrustMedium !== 'air' || !f.active.has(p.id)) continue;
      const engine = new T.Vector3(0, 1, 0)
        .applyQuaternion(partRotation(p))
        .multiplyScalar((engineMaxThrust(p) * density) / 1.225);
      thrust.add(engine);
      thrustTorque.add(partCenter(p).sub(f.stats.com).cross(engine));
    }
  }
  const available = thrust.dot(flow),
    throttle =
      available > 0
        ? (f.stats.mass * gravity * Math.sin(slope * rad) - force.dot(flow)) / available
        : Infinity;
  force.addScaledVector(thrust, throttle);
  torque.addScaledVector(thrustTorque, throttle);
  return {
    speed,
    alpha,
    pitchCommand,
    throttle,
    stalled,
    liftError: force.dot(up) - f.stats.mass * gravity,
    pitchTorque: torque.x
  };
}
function pitchTrim(f: LandingTrimFlight, options: TrimPoint): TrimForces | null {
  let lo = -0.8,
    hi = 0.8,
    left = trimForces(f, {...options, pitchCommand: lo}),
    right = trimForces(f, {...options, pitchCommand: hi});
  if (!Number.isFinite(left.pitchTorque) || left.pitchTorque * right.pitchTorque > 0) return null;
  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2,
      value = trimForces(f, {...options, pitchCommand: mid});
    if (value.pitchTorque * left.pitchTorque > 0) {
      lo = mid;
      left = value;
    } else hi = mid;
  }
  return trimForces(f, {...options, pitchCommand: (lo + hi) / 2});
}
// A call without a speed has no trim: NaN makes every candidate non-finite, so the search returns null.
export function landingTrim(
  f: LandingTrimFlight,
  {speed = NaN, density = 1.225, gravity = 9.81, slope = -3}: TrimAir & {speed?: number; slope?: number} = {}
): TrimForces | null {
  let previous: TrimForces | null = null;
  for (let alpha = 0; alpha <= 12; alpha += 0.5) {
    const value = pitchTrim(f, {speed, alpha, density, gravity, slope});
    if (value && previous && value.liftError * previous.liftError <= 0) {
      let lo = previous.alpha,
        hi = alpha,
        result: TrimForces | null = value;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        result = pitchTrim(f, {speed, alpha: mid, density, gravity, slope});
        if (!result) return null;
        if (result.liftError * previous.liftError > 0) lo = mid;
        else hi = mid;
      }
      return !result.stalled && result.throttle >= 0 && result.throttle <= 1 ? result : null;
    }
    previous = value;
  }
  return null;
}

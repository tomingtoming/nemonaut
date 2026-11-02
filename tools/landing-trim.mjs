// Longitudinal steady-flight estimate, not an admission or safety guarantee.
import * as T from 'three';
import {PARTS} from '../dist/catalog.js';
import {partRotation, partCenter, aeroPoint, surfaceForce, controlDeflection} from '../dist/aero.js';
import {engineMaxThrust, fuelNetworks} from '../dist/resources.js';
import {bodyDrag} from '../dist/body-drag.js';
const rad = Math.PI / 180;
export function planLandingTrim(f, {density = 1.225, gravity = 9.81} = {}) {
  // Bounded diagnostic search with 20% elevator travel held in reserve by
  // landingTrim. The additional speed margin is a candidate for flight testing.
  for (let speed = 40; speed <= 160; speed += 2) {
    if (!landingTrim(f, {speed, density, gravity})) continue;
    const selected = landingTrim(f, {speed: speed * 1.05, density, gravity});
    if (selected) return {...selected, minimumSample: speed, density, gravity, mass: f.stats.mass};
  }
  return null;
}
export function trimForces(f, {speed, alpha, pitchCommand, density = 1.225, gravity = 9.81, slope = -3}) {
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
      if (!PARTS[p.type].air || !f.active.has(p.id)) continue;
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
function pitchTrim(f, options) {
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
export function landingTrim(f, {speed, density = 1.225, gravity = 9.81, slope = -3} = {}) {
  let previous = null;
  for (let alpha = 0; alpha <= 12; alpha += 0.5) {
    const value = pitchTrim(f, {speed, alpha, density, gravity, slope});
    if (value && previous && value.liftError * previous.liftError <= 0) {
      let lo = previous.alpha,
        hi = alpha,
        result = value;
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

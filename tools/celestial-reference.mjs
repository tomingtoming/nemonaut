import {relativeMotion, bodyState, referenceBody} from '../dist/celestial.js';
function localStep(r, v, acceleration, mu, dt) {
  const gravity = r2 => r2.clone().multiplyScalar(-mu / Math.max(1, r2.length()) ** 3);
  const half = v.clone().addScaledVector(gravity(r).add(acceleration), dt / 2),
    next = r.clone().addScaledVector(half, dt);
  return {position: next, velocity: half.addScaledVector(gravity(next).add(acceleration), dt / 2)};
}
export function referenceStep(position, velocity, acceleration, dt, time = 0) {
  const relative = relativeMotion(position, velocity, time),
    body = relative.body;
  const next = localStep(relative.r, relative.velocity, acceleration, body.mu, dt),
    end = bodyState(body, time + dt);
  const pos = next.position.add(end.position),
    vel = next.velocity.add(end.velocity);
  return {pos, vel, bodyId: referenceBody(pos, time + dt).id};
}

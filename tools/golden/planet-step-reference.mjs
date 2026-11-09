import {gravity} from '../../dist/planet.js';

// Double precision kick-drift-kick; no float32 planetary positions or velocity cap.
export function advanceOrbit(pos, vel, acceleration, dt) {
  const half = vel.clone().addScaledVector(gravity(pos).add(acceleration), dt / 2);
  const next = pos.clone().addScaledVector(half, dt);
  return {pos: next, vel: half.addScaledVector(gravity(next).add(acceleration), dt / 2)};
}

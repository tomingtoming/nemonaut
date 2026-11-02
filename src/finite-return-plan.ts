import {deorbitPlan} from './deorbit-plan.js';
import {finiteBurnPreview, type FiniteBurnVessel, type FiniteBurnPreview} from './finite-burn.js';
import {maneuverPreview, type ManeuverComponents, type ManeuverPreview} from './maneuver.js';

// Solve the first reachable retrograde crossing at a fixed ignition epoch.
// Invalid long/low-altitude burns bound the search; they are never accepted.
export interface FiniteReturnOptions {
  throttle?: number;
  periapsis?: number;
  delay?: number;
}
export interface FiniteReturnPlan {
  location: {universalTime: number};
  components: ManeuverComponents;
  preview: ManeuverPreview;
  prediction: FiniteBurnPreview;
  throttle: number;
  tolerance: number;
  targetPeriapsis: number;
}
export function finiteReturnPlan(
  vessel: FiniteBurnVessel,
  {throttle = 0.1, periapsis = 25000, delay = 60}: FiniteReturnOptions = {}
): FiniteReturnPlan {
  if (![0.01, 0.1, 1].includes(throttle)) throw Error('帰還案の推力は1・10・100%から選んでください');
  const pos = vessel.pos.clone().add(vessel.stats.com.clone().applyQuaternion(vessel.q)),
    time = vessel.universalTime;
  const seed = deorbitPlan(pos, vessel.vel, time, {periapsis, delay}),
    direction = seed.preview.impulse.clone().normalize(),
    epoch = seed.location.universalTime;
  const evaluate = (dv: number) =>
    finiteBurnPreview(vessel, direction.clone().multiplyScalar(dv), epoch, {throttle, tolerance: 0.05});
  let low = 0.051,
    high = seed.preview.impulse.length(),
    best: {deltaV: number; prediction: FiniteBurnPreview} | null = null;
  // Surface/engine/propellant errors at the initial reference are useful directly.
  let prediction: FiniteBurnPreview | null = evaluate(high);
  for (let i = 0; i < 20 && prediction.orbit.periapsis > periapsis; i++) {
    low = high;
    high = Math.min(10000, high * 1.2);
    if (high === low) break;
    try {
      prediction = evaluate(high);
    } catch {
      prediction = null;
      break;
    }
  }
  if (prediction && prediction.orbit.periapsis <= periapsis) best = {deltaV: high, prediction};
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    let p;
    try {
      p = evaluate(mid);
    } catch {
      high = mid;
      continue;
    }
    if (Math.abs(p.orbit.periapsis - periapsis) < 1) {
      best = {deltaV: mid, prediction: p};
      break;
    }
    if (p.orbit.periapsis > periapsis) low = mid;
    else {
      high = mid;
      best = {deltaV: mid, prediction: p};
    }
  }
  if (!best || Math.abs(best.prediction.orbit.periapsis - periapsis) > 5)
    throw Error('この推力では対応範囲内に帰還案が見つかりません。推力を上げて再計算してください');
  const components = {prograde: -best.deltaV, normal: 0, radial: 0},
    preview = maneuverPreview(pos, vessel.vel, seed.location, components, time);
  return {
    location: seed.location,
    components,
    preview,
    prediction: best.prediction,
    throttle,
    tolerance: 0.05,
    targetPeriapsis: periapsis
  };
}

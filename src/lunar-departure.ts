import {PLANET, center, orbitState} from './planet.js';
import {terminalBurnThrottle} from './maneuver-thrust-profile.js';
import {MOON, bodyState, advanceCelestialOrbit} from './celestial.js';
import {coastDrift} from './coast-orbit.js';
import {lambertArc, type LambertArc} from './lambert.js';
import {predictTrajectory, type TrajectoryResult} from './trajectory.js';
import {captureBurnEstimate, type BurnEstimateVessel, type CaptureBurnEstimate} from './lunar-capture.js';
import {engineBurn, type FuelNetworks} from './resources.js';
import {centerOfMass} from './center-of-mass.js';
/** One instantaneous departure burn found on the parking conic. */
export interface LunarDepartureCandidate {
  plannedAt: number;
  time: number;
  position: import('three').Vector3;
  velocity: import('three').Vector3;
  impulse: import('three').Vector3;
  afterVelocity: import('three').Vector3;
  deltaV: number;
  duration: number;
  offset: number;
}
/** A candidate whose coast prediction reaches the Moon safely. */
export interface LunarDepartureSearchPlan extends LunarDepartureCandidate {
  prediction: TrajectoryResult;
}
/** A searched plan after the finite-burn check; finite is set unless an earlier warning stopped the check. */
export interface LunarDeparturePlan extends LunarDepartureSearchPlan {
  burn: CaptureBurnEstimate;
  startTime: number;
  warnings: string[];
  ready: boolean;
  finite?: TrajectoryResult;
}
export interface LunarDepartureSearchOptions {
  accept?: ((plan: LunarDepartureSearchPlan) => boolean) | null;
}
/** The vessel fields the lunar departure planner reads (a Flight satisfies it). */
export interface LunarDepartureVessel extends BurnEstimateVessel {
  throttle: number;
  pos: import('three').Vector3;
  q: import('three').Quaternion;
  vel: import('three').Vector3;
  universalTime: number;
  time: number;
  stats: {mass: number; com: import('three').Vector3};
  networks: Pick<FuelNetworks, 'groups'>;
}

// Search departure time on the actual parking conic. No seed position, clock,
// circularisation or propellant reset is applied to the vessel.
export function searchLunarDeparture(
  position: import('three').Vector3,
  velocity: import('three').Vector3,
  time: number,
  {accept = null}: LunarDepartureSearchOptions = {}
): LunarDepartureSearchPlan {
  // Seconds before the first candidate, departure phases per parking orbit, orbits searched, and
  // the aim offsets beyond the Moon (m).
  const preparation = 120,
    phases = 48,
    periods = 2,
    flybys = [400000, 800000, 1200000];
  const orbit = orbitState(position, velocity);
  if (!orbit.stable || orbit.apoapsis + PLANET.radius >= MOON.orbitRadius - MOON.sphereOfInfluence)
    throw Error('母星の安全な待機軌道から計画してください');
  if (!Number.isFinite(time) || time < 0) throw Error('月遷移探索の条件が不正です');
  const candidates: LunarDepartureCandidate[] = [];
  for (let i = 0; i < phases * periods; i++) {
    const delay = preparation + (orbit.period * i) / phases,
      departureTime = time + delay,
      at = coastDrift(position, velocity, time, delay),
      from = at.position.clone().sub(center);
    for (const duration of [12000, 18000, 24000, 30000, 36000])
      for (const offset of flybys) {
        const moon = bodyState(MOON, departureTime + duration),
          radial = moon.position.clone().sub(center).normalize(),
          target = moon.position.clone().addScaledVector(radial, offset).sub(center);
        let arc: LambertArc;
        try {
          arc = lambertArc(from, target, duration, PLANET.mu, orbit.normal);
        } catch {
          continue;
        }
        const impulse = arc.departure.clone().sub(at.velocity),
          deltaV = impulse.length(),
          after = orbitState(at.position, arc.departure);
        if (deltaV > 1500 || deltaV < 0.5 || after.periapsis < PLANET.atmosphereTop + 1000) continue;
        candidates.push({
          plannedAt: time,
          time: departureTime,
          position: at.position,
          velocity: at.velocity,
          impulse,
          afterVelocity: arc.departure,
          deltaV,
          duration,
          offset
        });
      }
  }
  candidates.sort((a, b) => a.deltaV - b.deltaV);
  let firstSafe: LunarDepartureSearchPlan | null = null;
  for (const candidate of candidates.slice(0, 32)) {
    const prediction = predictTrajectory(candidate.position, candidate.afterVelocity, candidate.time, {
      duration: Math.min(604800, candidate.duration * 1.6),
      samples: 160
    });
    if (
      prediction.events.some(e => e.type === 'enter-moon') &&
      prediction.closest.altitude > 10000 &&
      prediction.closest.altitude < 1000000 &&
      !prediction.closest.atBoundary &&
      prediction.reason === 'duration'
    ) {
      const plan = {...candidate, prediction};
      firstSafe ??= plan;
      if (!accept || accept(plan)) return plan;
    }
  }
  if (firstSafe) return firstSafe;
  throw Error('探索範囲内に安全な月接近案が見つかりません');
}

export function lunarDeparturePlan(vessel: LunarDepartureVessel): LunarDeparturePlan {
  if (vessel.throttle !== 0) throw Error('噴射を停止してから月遷移を計画してください');
  captureBurnEstimate(vessel, 1);
  // Every plan the search returns has passed through accept, which completes it in place.
  const evaluated = new Map<LunarDepartureSearchPlan, LunarDeparturePlan>();
  const found = searchLunarDeparture(centerOfMass(vessel), vessel.vel, vessel.universalTime, {
      accept: plan => {
        const result = evaluateFiniteDeparture(vessel, plan);
        evaluated.set(plan, result);
        return result.ready;
      }
    }),
    result = evaluated.get(found);
  if (!result) throw Error('月遷移案の有限噴射を確認できません');
  return result;
}

// The cheapest instantaneous burn may collide once its real duration is used.
// Test other candidates before reporting that the vessel has no usable plan.
function evaluateFiniteDeparture(
  vessel: LunarDepartureVessel,
  search: LunarDepartureSearchPlan
): LunarDeparturePlan {
  const burn = captureBurnEstimate(vessel, search.deltaV),
    warnings: string[] = [],
    plan = Object.assign(search, {burn, startTime: search.time - burn.duration / 2, warnings});
  if (!plan.burn.enough) plan.warnings.push('現在の点火段では推進剤が不足しています');
  if (plan.startTime - vessel.universalTime < 60) plan.warnings.push('姿勢調整の60秒を確保できません');
  if (plan.warnings.length) return Object.assign(plan, {ready: false});
  const at = coastDrift(
      centerOfMass(vessel),
      vessel.vel,
      vessel.universalTime,
      plan.startTime - vessel.universalTime
    ),
    fuel = new Map<string, number>(vessel.fuel),
    direction = plan.impulse.clone().normalize();
  let pos = at.position,
    vel = at.velocity,
    time = plan.startTime,
    mass = vessel.stats.mass,
    left = plan.deltaV;
  for (let i = 0; i < 144000 && left >= 0.5; i++) {
    const dt = 1 / 120,
      before = [...fuel.values()].reduce((a, b) => a + b, 0),
      throttle = terminalBurnThrottle(left);
    const thrust = [...engineBurn(vessel.networks, fuel, vessel.active, throttle, 0, dt).values()].reduce(
        (a, b) => a + b,
        0
      ),
      used = before - [...fuel.values()].reduce((a, b) => a + b, 0);
    if (thrust <= 0) break;
    const next = advanceCelestialOrbit(pos, vel, direction.clone().multiplyScalar(thrust / mass), dt, time);
    pos = next.pos;
    vel = next.vel;
    time += dt;
    left -= (thrust / mass) * dt;
    mass -= used;
  }
  const finite = predictTrajectory(pos, vel, time, {duration: plan.duration * 1.6, samples: 160});
  if (
    left >= 0.5 ||
    !finite.events.some(e => e.type === 'enter-moon') ||
    finite.closest.altitude < 10000 ||
    finite.closest.altitude > 1000000 ||
    finite.closest.atBoundary ||
    finite.reason !== 'duration'
  )
    plan.warnings.push('有限噴射では安全な月接近を確認できません');
  return Object.assign(plan, {finite, ready: plan.warnings.length === 0});
}

export function lunarDepartureNode(
  plan: LunarDeparturePlan,
  vessel: Pick<LunarDepartureVessel, 'universalTime' | 'time'>
): import('./maneuver-node.js').ManeuverNodeRecord {
  if (!plan.ready) throw Error(plan.warnings.join(' / '));
  if (plan.plannedAt !== vessel.universalTime) throw Error('時刻が進んだため月遷移案を再計算してください');
  const finite = plan.finite;
  if (!finite) throw Error('有限噴射の月接近予測がありません');
  return {
    universalTime: plan.startTime,
    time: vessel.time + plan.startTime - vessel.universalTime,
    position: plan.position.toArray(),
    velocity: plan.afterVelocity.toArray(),
    impulse: plan.impulse.toArray(),
    remaining: plan.impulse.toArray(),
    complete: false,
    departure: {
      midTime: plan.time,
      duration: plan.burn.duration,
      deltaV: plan.deltaV,
      periapsis: finite.closest.altitude
    }
  };
}

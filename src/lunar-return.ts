import * as T from 'three';
import {terminalBurnThrottle} from './maneuver-thrust-profile.js';
import {
  MOON,
  bodyState,
  bodyOrbitState,
  advanceCelestialOrbit,
  type OrbitState,
  type BodyState
} from './celestial.js';
import {PLANET} from './planet.js';
import {keplerDrift, coastDrift} from './coast-orbit.js';
import {captureBurnEstimate, type LunarCaptureVessel, type CaptureBurnEstimate} from './lunar-capture.js';
import {engineBurn, type FuelNetworks} from './resources.js';
import {centerOfMass} from './center-of-mass.js';

// The lunar conic is followed to its actual SOI radius, then translated using
// the ephemeris at that epoch. No parent-planet velocity is added twice.
export interface LunarEscape {
  time: number;
  position: T.Vector3;
  velocity: T.Vector3;
  orbit: OrbitState;
}
export interface ReturnCandidate {
  time: number;
  position: T.Vector3;
  velocity: T.Vector3;
  impulse: T.Vector3;
  afterVelocity: T.Vector3;
  deltaV: number;
  exit: LunarEscape;
}
export interface LunarReturnSearch extends ReturnCandidate {
  plannedAt: number;
  targetPeriapsis: number;
}
export interface LunarReturnOptions {
  targetPeriapsis?: number;
  phases?: number;
  preparation?: number;
}
export interface FiniteReturnBurn {
  exit: LunarEscape;
  duration: number;
  remainingFuel: number;
}
export interface LunarReturnPlan extends LunarReturnSearch {
  burn: CaptureBurnEstimate;
  startTime: number;
  warnings: string[];
  finite: FiniteReturnBurn | null;
  ready: boolean;
}
export interface LunarReturnVessel extends LunarCaptureVessel {
  networks: Pick<FuelNetworks, 'groups'>;
}
export function lunarEscape(position: T.Vector3, velocity: T.Vector3, time: number): LunarEscape | null {
  const moon = bodyState(MOON, time),
    r = position.clone().sub(moon.position),
    v = velocity.clone().sub(moon.velocity);
  if (r.length() >= MOON.sphereOfInfluence || v.lengthSq() / 2 - MOON.mu / r.length() <= 0) return null;
  let high = 60,
    at: BodyState | undefined;
  for (let i = 0; i < 16; i++) {
    at = keplerDrift(r, v, MOON.mu, high);
    if (at.position.length() >= MOON.sphereOfInfluence) break;
    high *= 2;
  }
  if (!at || at.position.length() < MOON.sphereOfInfluence) return null;
  let low = 0;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2,
      next = keplerDrift(r, v, MOON.mu, mid);
    if (next.position.length() < MOON.sphereOfInfluence) low = mid;
    else high = mid;
  }
  // A millisecond past the crossing avoids ambiguous floating-point membership at the SOI.
  at = keplerDrift(r, v, MOON.mu, high + 0.001);
  const epoch = time + high + 0.001,
    endMoon = bodyState(MOON, epoch);
  const pos = at.position.add(endMoon.position),
    vel = at.velocity.add(endMoon.velocity),
    orbit = bodyOrbitState(pos, vel, epoch);
  if (orbit.bodyId !== 'planet') return null;
  return {time: epoch, position: pos, velocity: vel, orbit};
}

export function returnCandidate(
  position: T.Vector3,
  velocity: T.Vector3,
  time: number,
  deltaV: number
): ReturnCandidate | null {
  if (!Number.isFinite(deltaV) || deltaV <= 0) throw Error('帰還噴射量が不正です');
  const orbit = bodyOrbitState(position, velocity, time);
  if (orbit.bodyId !== 'moon') return null;
  const impulse = orbit.relativeVelocity.clone().normalize().multiplyScalar(deltaV),
    afterVelocity = velocity.clone().add(impulse),
    exit = lunarEscape(position, afterVelocity, time);
  if (!exit || exit.orbit.energy >= 0 || exit.orbit.vertical >= 0) return null;
  return {time, position: position.clone(), velocity: velocity.clone(), impulse, afterVelocity, deltaV, exit};
}

// A bounded first search over one orbit. Refinement changes burn magnitude,
// preserving the sampled orbital phase and the actual lunar orbital plane.
export function searchLunarReturn(
  position: T.Vector3,
  velocity: T.Vector3,
  time: number,
  {targetPeriapsis = 35000, phases = 48, preparation = 120}: LunarReturnOptions = {}
): LunarReturnSearch {
  if (
    !Number.isFinite(targetPeriapsis) ||
    targetPeriapsis < 10000 ||
    targetPeriapsis >= PLANET.atmosphereTop ||
    !Number.isInteger(phases) ||
    phases < 8 ||
    phases > 192 ||
    !Number.isFinite(preparation) ||
    preparation < 60
  )
    throw Error('帰還探索条件が不正です');
  const orbit = bodyOrbitState(position, velocity, time);
  if (
    orbit.bodyId !== 'moon' ||
    orbit.energy >= 0 ||
    orbit.periapsis < 1000 ||
    orbit.apoapsis + MOON.radius >= MOON.sphereOfInfluence
  )
    throw Error('月重力圏内の安全な周回軌道から計画してください');
  let best: ReturnCandidate | null = null;
  for (let phase = 0; phase < phases; phase++) {
    const delay = preparation + (orbit.period * phase) / phases,
      epoch = time + delay,
      at = coastDrift(position, velocity, time, delay),
      o = bodyOrbitState(at.position, at.velocity, epoch);
    const minimum = Math.sqrt((2 * MOON.mu) / o.r.length()) - o.speed;
    let prior: ReturnCandidate | null = null;
    for (const excess of [5, 20, 50, 100, 175, 275, 400, 600, 900]) {
      const candidate = returnCandidate(at.position, at.velocity, epoch, minimum + excess);
      if (
        candidate &&
        prior &&
        (candidate.exit.orbit.periapsis - targetPeriapsis) * (prior.exit.orbit.periapsis - targetPeriapsis) <=
          0
      ) {
        let a = prior,
          b = candidate;
        for (let j = 0; j < 25; j++) {
          const mid = returnCandidate(at.position, at.velocity, epoch, (a.deltaV + b.deltaV) / 2);
          if (!mid) break;
          if ((a.exit.orbit.periapsis - targetPeriapsis) * (mid.exit.orbit.periapsis - targetPeriapsis) <= 0)
            b = mid;
          else a = mid;
        }
        const choice =
          Math.abs(a.exit.orbit.periapsis - targetPeriapsis) <
          Math.abs(b.exit.orbit.periapsis - targetPeriapsis)
            ? a
            : b;
        if (
          Math.abs(choice.exit.orbit.periapsis - targetPeriapsis) < 100 &&
          (!best || choice.deltaV < best.deltaV)
        )
          best = choice;
      }
      prior = candidate;
    }
  }
  if (!best) throw Error('この軌道では探索範囲内に母星帰還案が見つかりません');
  return {...best, plannedAt: time, targetPeriapsis};
}

// Ideal aligned finite burn using the same active fuel network and gravity.
// This bounds the usefulness of the impulsive search before offering a plan.
export function predictReturnBurn(
  vessel: LunarReturnVessel,
  plan: Pick<LunarReturnPlan, 'impulse' | 'time' | 'burn' | 'deltaV'>
): FiniteReturnBurn | null {
  const fuel = new Map<string, number>(vessel.fuel),
    direction = plan.impulse.clone().normalize(),
    start = plan.time - plan.burn.duration / 2;
  const at = coastDrift(centerOfMass(vessel), vessel.vel, vessel.universalTime, start - vessel.universalTime);
  let pos = at.position,
    vel = at.velocity,
    time = start,
    mass = vessel.stats.mass,
    remaining = plan.deltaV;
  for (let i = 0; i < 144000 && remaining >= 0.5; i++) {
    const dt = 1 / 120,
      throttle = terminalBurnThrottle(remaining),
      before = [...fuel.values()].reduce((a, b) => a + b, 0);
    const thrust = [...engineBurn(vessel.networks, fuel, vessel.active, throttle, 0, dt).values()].reduce(
        (a, b) => a + b,
        0
      ),
      used = before - [...fuel.values()].reduce((a, b) => a + b, 0);
    if (thrust <= 0) return null;
    const next = advanceCelestialOrbit(pos, vel, direction.clone().multiplyScalar(thrust / mass), dt, time);
    pos = next.pos;
    vel = next.vel;
    time += dt;
    remaining -= (thrust / mass) * dt;
    mass -= used;
  }
  if (remaining >= 0.5) return null;
  const exit = lunarEscape(pos, vel, time);
  return exit
    ? {exit, duration: time - start, remainingFuel: [...fuel.values()].reduce((a, b) => a + b, 0)}
    : null;
}

export function lunarReturnPlan(
  vessel: LunarReturnVessel,
  options: LunarReturnOptions = {}
): LunarReturnPlan {
  if (vessel.throttle !== 0) throw Error('噴射を停止してから帰還計画を作成してください');
  // Check the propulsion configuration before spending work on a search.
  captureBurnEstimate(vessel, 1);
  const search = searchLunarReturn(centerOfMass(vessel), vessel.vel, vessel.universalTime, options),
    burn = captureBurnEstimate(vessel, search.deltaV);
  const plan: LunarReturnPlan = {
    ...search,
    burn,
    startTime: search.time - burn.duration / 2,
    warnings: [],
    finite: null,
    ready: false
  };
  if (!plan.burn.enough) plan.warnings.push('現在の点火段では推進剤が不足しています');
  if (plan.startTime - vessel.universalTime < 60) plan.warnings.push('姿勢調整の60秒を確保できません');
  const orbit = bodyOrbitState(plan.position, plan.velocity, plan.time);
  if (plan.burn.duration > Math.sqrt(orbit.r.length() ** 3 / MOON.mu) * 0.1)
    plan.warnings.push('噴射が長すぎてこの帰還案の適用範囲を越えます');
  plan.finite = plan.warnings.length ? null : predictReturnBurn(vessel, plan);
  if (
    !plan.finite ||
    plan.finite.exit.orbit.energy >= 0 ||
    plan.finite.exit.orbit.vertical >= 0 ||
    plan.finite.exit.orbit.periapsis < 10000 ||
    plan.finite.exit.orbit.periapsis >= PLANET.atmosphereTop
  )
    plan.warnings.push('有限時間の噴射では母星の大気へ安全に接近する範囲に入りません');
  plan.ready = plan.warnings.length === 0;
  return plan;
}

export function lunarReturnNode(
  plan: LunarReturnPlan,
  vessel: Pick<LunarCaptureVessel, 'universalTime' | 'time'>
): import('./maneuver-node.js').ManeuverNodeRecord {
  if (!plan.ready) throw Error(plan.warnings.join(' / '));
  if (plan.plannedAt !== vessel.universalTime) throw Error('時刻が進んだため帰還案を再計算してください');
  const finite = plan.finite;
  if (!finite) throw Error('有限噴射の帰還予測がありません');
  return {
    universalTime: plan.startTime,
    time: vessel.time + plan.startTime - vessel.universalTime,
    position: plan.position.toArray(),
    velocity: plan.afterVelocity.toArray(),
    impulse: plan.impulse.toArray(),
    remaining: plan.impulse.toArray(),
    complete: false,
    returnPlan: {
      targetPeriapsis: plan.targetPeriapsis,
      midTime: plan.time,
      duration: plan.burn.duration,
      deltaV: plan.deltaV,
      predictedPeriapsis: finite.exit.orbit.periapsis,
      exitTime: finite.exit.time
    }
  };
}

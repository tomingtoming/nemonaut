import * as T from 'three';
import {PARTS} from './catalog.js';
import {bodyOrbitState, MOON, type CelestialBodyId} from './celestial.js';
import {partCenter, partRotation, type AeroPart} from './aero.js';
import {engineBurn, type FuelNetworks, type ResourcePart, type EngineSet} from './resources.js';
import {engineSubmersion} from './engine-medium.js';
import {atmosphere} from './planet.js';
import {surfaceRelativeVelocity} from './surface-frame.js';

// Geometry is evaluated at the lowest part, not the vehicle origin or COM.
// Braking figures assume thrust aligned against motion and constant gravity;
// they are conservative guidance, not a promised touchdown prediction.
/** The vessel fields descentTelemetry reads (a Flight satisfies it). */
export interface DescentVessel {
  pos: T.Vector3;
  q: T.Quaternion;
  vel: T.Vector3;
  universalTime: number;
  stats: {com: T.Vector3; mass: number};
  parts: readonly (AeroPart & {id: string})[];
  networks: Pick<FuelNetworks<ResourcePart & AeroPart>, 'groups'>;
  fuel: ReadonlyMap<string, number>;
  started: boolean;
  active: EngineSet;
  landed?: boolean;
  crashed?: boolean;
}
/** Lowest-part descent figures (SI units; tilt in degrees). */
export interface DescentTelemetry {
  body: CelestialBodyId;
  energy: number;
  periapsis: number;
  apoapsis: number;
  clearance: number;
  vertical: number;
  horizontal: number;
  speed: number;
  gravity: number;
  thrust: number;
  acceleration: number;
  netAcceleration: number;
  hoverThrottle: number;
  brakingDistance: number;
  verticalBrakingDistance: number;
  tilt: number | null;
  landed: boolean | undefined;
  crashed: boolean | undefined;
  legs: number;
}
export function availableEngineForce(v: DescentVessel, density: number, pressure: number): T.Vector3 {
  const burns = engineBurn(
      v.networks,
      new Map<string, number>(v.fuel),
      v.started ? v.active : new Set(),
      1,
      density,
      0.001,
      pressure,
      p => 1 - engineSubmersion(v, p)
    ),
    force = new T.Vector3();
  let totalThrust = 0;
  for (const p of v.parts) {
    const thrust = burns.get(p.id) || 0;
    totalThrust += thrust;
    if (thrust) force.addScaledVector(new T.Vector3(0, 1, 0).applyQuaternion(partRotation(p)), thrust);
  }
  // A half-turn can leave a numerical residue when opposed engines cancel.
  return force.length() > totalThrust * 1e-12 ? force : force.set(0, 0, 0);
}

export function descentTelemetry(v: DescentVessel): DescentTelemetry {
  const com = v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q)),
    o = bodyOrbitState(com, v.vel, v.universalTime),
    up = o.r.clone().normalize();
  let clearance = Infinity;
  for (const p of v.parts) {
    const rotation = v.q.clone().multiply(partRotation(p)),
      c = partCenter(p).applyQuaternion(v.q).add(v.pos),
      [x, y, z] = PARTS[p.type].size;
    for (const a of [-1, 1])
      for (const b of [-1, 1])
        for (const d of [-1, 1]) {
          const corner = new T.Vector3((a * x) / 2, (b * y) / 2, (d * z) / 2)
            .applyQuaternion(rotation)
            .add(c);
          clearance = Math.min(clearance, corner.distanceTo(o.center) - o.body.radius);
        }
  }
  const air = o.bodyId === 'planet' ? atmosphere(o.altitude) : {density: 0, pressure: 0};
  const force = availableEngineForce(v, air.density, air.pressure);
  const velocity = surfaceRelativeVelocity(com, v.vel, v.universalTime, o.body),
    speed = velocity.length();
  const thrust = force.length(),
    acceleration = thrust / v.stats.mass,
    netAcceleration = acceleration - o.gravity,
    vertical = velocity.dot(up),
    horizontal = Math.sqrt(Math.max(0, speed ** 2 - vertical ** 2)),
    fall = Math.max(0, -vertical);
  const brakingDistance = netAcceleration > 0 ? speed ** 2 / (2 * netAcceleration) : Infinity,
    verticalBrakingDistance = netAcceleration > 0 ? (fall * fall) / (2 * netAcceleration) : Infinity;
  const tilt = thrust ? (force.normalize().applyQuaternion(v.q).angleTo(up) * 180) / Math.PI : null;
  return {
    body: o.bodyId,
    energy: o.energy,
    periapsis: o.periapsis,
    apoapsis: o.apoapsis,
    clearance,
    vertical,
    horizontal,
    speed,
    gravity: o.gravity,
    thrust,
    acceleration,
    netAcceleration,
    hoverThrottle: acceleration > 0 ? o.gravity / acceleration : Infinity,
    brakingDistance,
    verticalBrakingDistance,
    tilt,
    landed: v.landed && !v.crashed,
    crashed: v.crashed,
    legs: v.parts.filter(p => PARTS[p.type].landingLeg).length
  };
}

export function descentGuidance(d: DescentTelemetry, throttle = 0): string {
  if (d.crashed) return '機体損傷';
  if (d.body === 'planet') {
    if (d.landed) return throttle > 0 ? '接地・静止：噴射を停止してください' : '接地・静止';
    if (!d.thrust) return '点火段・推進剤を確認してください';
    if (d.netAcceleration <= 0) return '推力不足：降下速度を止められません';
    if (d.vertical > 1) return '上昇中';
    if (d.clearance < d.verticalBrakingDistance) return '降下の減速距離が対地距離を超えています';
    return d.horizontal > 5 ? '横移動を減速してください' : '接地前に鉛直速度を1 m/s未満へ';
  }
  if (d.landed)
    return throttle > 0 ? '月面で静止：噴射を停止してください' : '月面着陸完了：噴射停止・静止を確認';
  // Braking distance alone says nothing about whether a surface intercept exists.
  // Do not tell an escaping or safely orbiting craft to cancel its velocity.
  if (d.energy >= 0 && d.vertical >= 0) return '月から離脱中。帰還計画と脱出後の母星軌道を確認してください';
  if (d.energy < 0 && d.periapsis > 1000 && d.apoapsis + MOON.radius < MOON.sphereOfInfluence)
    return '月周回中。着陸する場合は近点を下げ、降下経路と燃料を確認してください';
  if (d.vertical > 1) return '上昇中。遠点・近点と再離陸の計器を確認してください';
  if (!d.thrust) return '点火段・推進剤を確認してください。Spaceで点火、スロットルは手動です。';
  if (d.netAcceleration <= 0) return '推力不足：月面へ向かう速度を止められません';
  if (d.clearance < d.brakingDistance) return '減速距離が対地距離を超えています：直ちに減速し、姿勢も確認';
  return d.horizontal > 5
    ? '降下進入中：水平速度を減らしてください'
    : '天頂へ整列し、接地前に鉛直速度を1 m/s未満へ';
}

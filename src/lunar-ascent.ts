import * as T from 'three';
import {bodyUp, relativeMotion, MOON, type OrbitState} from './celestial.js';
import {attitudeTarget} from './navigation.js';
export interface AscentAttitudeFlight {
  crashed?: boolean;
  rocketAxes?: unknown;
  pos: T.Vector3;
  vel: T.Vector3;
  q: T.Quaternion;
  stats: {com: T.Vector3};
  universalTime: number;
  sas: boolean;
  sasMode: string;
  holdQ?: T.Quaternion | null;
}

// Commands only a SAS target. The installed actuators must rotate the craft.
export function setAscentAttitude(f: AscentAttitudeFlight, pitch: number): T.Vector3 {
  if (!Number.isFinite(pitch) || pitch < 0 || pitch > 90 || f.crashed || !f.rocketAxes)
    throw Error('離陸姿勢を指定できません');
  const pos = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
    up = bodyUp(pos, f.universalTime);
  const horizontal = relativeMotion(pos, f.vel, f.universalTime).velocity;
  horizontal.addScaledVector(up, -horizontal.dot(up));
  if (horizontal.length() < 1) {
    horizontal.set(0, 0, 1).addScaledVector(up, -up.z);
    if (horizontal.lengthSq() < 1e-8) horizontal.set(1, 0, 0).addScaledVector(up, -up.x);
  }
  horizontal.normalize();
  const radians = (pitch * Math.PI) / 180,
    target = horizontal.multiplyScalar(Math.cos(radians)).addScaledVector(up, Math.sin(radians));
  f.sas = true;
  f.sasMode = 'hold';
  f.holdQ = attitudeTarget(f.q, new T.Vector3(0, 1, 0), target);
  return target;
}

export function lunarOrbitReached(
  orbit: Pick<OrbitState, 'bodyId' | 'energy' | 'periapsis' | 'apoapsis'> | null | undefined
): boolean {
  return (
    !!orbit &&
    orbit.bodyId === 'moon' &&
    orbit.energy < 0 &&
    orbit.periapsis > 1000 &&
    orbit.apoapsis + MOON.radius < MOON.sphereOfInfluence
  );
}

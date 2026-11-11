import * as T from 'three';
import {bodyUp, relativeMotion, MOON, type OrbitState} from './celestial.js';
import {hasVacuumEngine} from './engine-medium.js';
import {canControl} from './fleet.js';
import {instrumentForward} from './command-frame.js';
import {attitudeTarget} from './navigation.js';
import {availableEngineForce, type DescentVessel} from './descent.js';
import {centerOfMass} from './center-of-mass.js';
export interface AscentAttitudeFlight extends DescentVessel {
  instrumentRotation: T.Quaternion;
  crashed?: boolean;
  rocketAxes: boolean;
  pos: T.Vector3;
  vel: T.Vector3;
  q: T.Quaternion;
  universalTime: number;
  sas: boolean;
  sasMode: string;
  holdQ?: T.Quaternion | null;
}

// Commands only a SAS target. The installed actuators must rotate the craft.
export function setAscentAttitude(f: AscentAttitudeFlight, pitch: number): T.Vector3 {
  if (!Number.isFinite(pitch) || pitch < 0 || pitch > 90 || !canControl(f) || !hasVacuumEngine(f.parts))
    throw Error('離陸姿勢を指定できません');
  const pos = centerOfMass(f),
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
  const force = availableEngineForce(f, 0, 0);
  // With no burn available, align the selected instrument for pre-ignition pointing.
  const axis = force.lengthSq() ? force.normalize() : instrumentForward(f.rocketAxes, f.instrumentRotation);
  f.sas = true;
  f.sasMode = 'hold';
  f.holdQ = attitudeTarget(f.q, axis, target);
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

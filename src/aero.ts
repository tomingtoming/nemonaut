import * as T from 'three';
import {PARTS, type PartVector} from './catalog.js';
import {fuelMass, type FuelMap} from './resources.js';
import {partRotation, partPointToVessel} from './part-frame.js';
export {partRotation} from './part-frame.js';
/** Minimal part shape for pose helpers: catalogue type plus local position and Euler rotation. */
export interface AeroPart {
  type: string;
  p: PartVector;
  r: PartVector;
}
export interface MassPart extends Pick<AeroPart, 'type'> {
  id: string;
  fuelLoad?: number;
}
export type ControlAxisName = 'pitch' | 'yaw' | 'roll';
export type ControlAxes = Record<ControlAxisName, boolean>;
export type ControlCommands = Partial<Record<ControlAxisName, number>>;
export interface ControlPart extends AeroPart {
  controlEnabled?: boolean;
  controlPitch?: boolean;
  controlYaw?: boolean;
  controlRoll?: boolean;
  controlLimit?: number;
}
export interface AeroAnalysis {
  center: T.Vector3;
  area: number;
  chord: number;
  weight: number;
  staticMargin: number | null;
}
export interface SurfaceForce {
  force: T.Vector3;
  alpha: number;
  cl: number;
  stalled: boolean;
}
export function partMass(
  p: MassPart,
  fuel: FuelMap | number = 1,
  ballast = 0,
  thermal: ReadonlyMap<string, {ablator?: number}> | null = null
): number {
  const d = PARTS[p.type];
  return (
    d.mass + fuelMass(p, fuel) + (d.ballast || 0) * ballast + (thermal?.get(p.id)?.ablator ?? d.ablator ?? 0)
  );
}
export function partCenter(p: AeroPart): T.Vector3 {
  const d = PARTS[p.type];
  return partPointToVessel(p, d.massCenter || [0, 0, 0], d.modelCenter);
}
export function aeroPoint(p: AeroPart): T.Vector3 {
  const d = PARTS[p.type];
  return partPointToVessel(p, d.ac || [0, 0, 0], d.modelCenter);
}
export function aeroAnalysis(parts: readonly AeroPart[], com: T.Vector3): AeroAnalysis {
  const center = new T.Vector3();
  let weight = 0,
    chord = 0,
    area = 0;
  for (const p of parts) {
    const d = PARTS[p.type];
    if (!d.wing) continue;
    const normal = new T.Vector3(0, 0, 1).applyQuaternion(partRotation(p)),
      w = d.wing * normal.y ** 2;
    center.addScaledVector(aeroPoint(p), w);
    weight += w;
    chord += w * (d.chord || 1);
    area += d.wing;
  }
  center.divideScalar(weight || 1);
  chord /= weight || 1;
  return {center, area, chord, weight, staticMargin: weight ? (com.z - center.z) / (chord || 1) : null};
}
export function surfaceForce(
  p: Pick<AeroPart, 'type'>,
  orientation: T.Quaternion,
  velocity: T.Vector3,
  density: number,
  deflection = 0
): SurfaceForce {
  const d = PARTS[p.type],
    normal = new T.Vector3(0, 0, 1),
    forward = new T.Vector3(0, 1, 0),
    span = new T.Vector3(1, 0, 0);
  const hinge = new T.Quaternion().setFromAxisAngle(span, deflection);
  normal.applyQuaternion(hinge).applyQuaternion(orientation);
  forward.applyQuaternion(hinge).applyQuaternion(orientation);
  span.applyQuaternion(orientation);
  const flow = velocity.clone().addScaledVector(span, -velocity.dot(span)),
    speed = flow.length();
  if (speed < 0.05) return {force: new T.Vector3(), alpha: 0, cl: 0, stalled: false};
  const alpha = Math.atan2(-flow.dot(normal), flow.dot(forward)),
    a = Math.abs(alpha),
    stall = (15 * Math.PI) / 180;
  const cl =
    a <= stall
      ? SURFACE_LIFT_SLOPE * alpha
      : Math.sign(alpha) * 1.18 * Math.cos(Math.min(Math.PI / 2, (a - stall) * 1.4));
  const cd = 0.022 + 0.065 * cl * cl + 1.2 * Math.sin(alpha) ** 2;
  const direction = flow.clone().normalize();
  const lift = normal.clone().addScaledVector(direction, -normal.dot(direction)).normalize();
  if (d.wing === undefined) throw Error('翼面積のない部品です');
  const q = 0.5 * density * speed * speed * d.wing;
  return {
    force: lift.multiplyScalar(q * cl).addScaledVector(direction, -q * cd),
    alpha,
    cl,
    stalled: a > stall
  };
}
/** Lift slope per radian of the surfaces below the stall (cl = 4.5·alpha in surfaceForce). */
export const SURFACE_LIFT_SLOPE = 4.5;
/**
 * Factor (0..1] on the force of one of `surfaces` lifting surfaces for a physics step of `dt` (s), so
 * that the step stays stable when the fluid is dense (BACKLOG 9b). Near zero angle of attack the force
 * of a surface with `area` (m²) at `speed` (m/s) through a fluid of `density` changes with the flow
 * across it like a damper of about density·speed·area·(lift slope / 2 + flat-plate drag 1.2) N per
 * m/s. An explicit step overshoots such a damper once dt·k/m exceeds 1, where 1/m is the craft's
 * `inverseEffectiveMass` (1/m + (r×n)·I⁻¹(r×n)) at the surface across its plane: the cross flow would
 * reverse within one step and the craft would flutter with growing speed. Real fluid forces cannot
 * reverse the flow within a step, so the force is scaled down to the critically damped step, shared
 * among all surfaces. Ordinary surfaces in air and in water stay far below this (factor exactly 1);
 * it acts on light parts with large surfaces moving fast through water, such as a broken-off wing.
 */
export function surfaceForceScale(
  density: number,
  speed: number,
  area: number,
  inverseEffectiveMass: number,
  dt: number,
  surfaces = 1
): number {
  const stiffness = density * speed * area * (SURFACE_LIFT_SLOPE / 2 + 1.2),
    ratio = dt * inverseEffectiveMass * stiffness * Math.max(1, surfaces);
  return ratio > 1 ? 1 / ratio : 1;
}
export function controlAxes(p: ControlPart): ControlAxes {
  const axis = PARTS[p.type].controlAxis;
  return {
    pitch: p.controlPitch ?? (axis === 'auto' || axis === 'pitch'),
    yaw: p.controlYaw ?? (axis === 'auto' || axis === 'yaw'),
    roll: p.controlRoll ?? (axis === 'auto' || axis === 'roll')
  };
}
export function controlDeflection(p: ControlPart, com: T.Vector3, commands: ControlCommands): number {
  const d = PARTS[p.type];
  if (!d.controlAxis || p.controlEnabled === false) return 0;
  const n = new T.Vector3(0, 0, 1).applyQuaternion(partRotation(p)),
    moment = aeroPoint(p).sub(com).cross(n),
    axes = controlAxes(p);
  // Normalize only the enabled moment components. Single-axis defaults retain
  // their original full travel; mixed axes share the same bounded travel.
  const leverage = moment.length();
  moment.set(axes.pitch ? moment.x : 0, axes.yaw ? moment.y : 0, axes.roll ? moment.z : 0);
  if (moment.length() < Math.max(1e-9, leverage * 1e-8)) return 0;
  moment.normalize();
  const intent = new T.Vector3(commands.pitch || 0, commands.yaw || 0, commands.roll || 0);
  return (
    (T.MathUtils.clamp(moment.dot(intent), -1, 1) *
      (d.maxDeflection || (d.controlAxis === 'auto' ? 18 : 25)) *
      (p.controlLimit ?? 1) *
      Math.PI) /
    180
  );
}

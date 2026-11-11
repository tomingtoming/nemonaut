// Cruise guidance using the existing actuators. Takeoff and landing are separate modes.
// Uses the existing SAS and throttle; never changes physical pose or velocity.
import * as T from 'three';
import {bodyUp, bodyAltitude, bodyGravity, referenceBody} from './celestial.js';
import {compassFrame, compassHeading} from './navigation.js';
import {surfaceRelativeVelocity} from './surface-frame.js';
import {atmosphere} from './planet.js';
import {PARTS} from './catalog.js';
import {partRotation, controlDeflection, type ControlPart} from './aero.js';
import {fuelNetworks, engineMaxThrust, type ResourcePart, type EngineSet} from './resources.js';
import {centerOfMass} from './center-of-mass.js';
const clamp = T.MathUtils.clamp,
  rad = Math.PI / 180;
export type CruiseSettingsInput = {
  speed: number;
  altitude: number;
  heading: number;
  mode?: string;
  vertical?: number;
};
export interface CruiseSettings {
  speed: number;
  altitude: number;
  heading: number;
  mode: string;
  vertical: number;
}
export type CruisePart = ControlPart & ResourcePart;
export interface CruiseStats {
  mass: number;
  com: T.Vector3;
  aero: {weight: number};
}
export interface CruiseFlight {
  pos: T.Vector3;
  vel: T.Vector3;
  q: T.Quaternion;
  universalTime: number;
  stats: CruiseStats;
  parts: CruisePart[];
  crashed?: boolean;
  rocketAxes?: boolean;
  started?: boolean;
  telemetry: {contacts?: number};
  fuel: ReadonlyMap<string, number>;
  active: EngineSet;
  vesselId: string;
  sas: boolean;
  sasMode: string;
  trim: number;
  throttle: number;
  holdQ?: T.Quaternion;
}
export interface CruisePrevious {
  sas: boolean;
  sasMode: string;
  trim: number;
}
export interface CruiseTelemetry {
  height: number;
  speed: number;
  vertical: number;
  heading: number;
  pitch: number;
  bank: number;
  throttle: number;
  liftAngle: number;
  liftMargin: number;
}
export function cruiseSettings(value: Partial<CruiseSettingsInput> | null | undefined): CruiseSettings {
  if (!value) throw Error('巡航目標の範囲を確認してください');
  const {speed, altitude, heading} = value;
  if (
    !['altitude', 'vertical'].includes(value.mode ?? 'altitude') ||
    typeof speed !== 'number' ||
    typeof altitude !== 'number' ||
    typeof heading !== 'number' ||
    !Number.isFinite(speed) ||
    !Number.isFinite(altitude) ||
    !Number.isFinite(heading) ||
    speed < 40 ||
    speed > 350 ||
    altitude < 300 ||
    altitude > 15000 ||
    heading < 0 ||
    heading >= 360 ||
    !Number.isFinite(value.vertical ?? 0) ||
    Math.abs(value.vertical ?? 0) > 10
  )
    throw Error('巡航目標の範囲を確認してください');
  return {speed, altitude, heading, mode: value.mode ?? 'altitude', vertical: value.vertical ?? 0};
}
// Conservative pre-stall estimate at the requested altitude, including a
// 20-degree bank. This is an admission check, not a certified stall speed.
export function cruiseTargetReadiness(
  f: Pick<CruiseFlight, 'pos' | 'universalTime' | 'stats'>,
  target: {speed: number; altitude: number; mode?: string; heading?: number | null; vertical?: number}
): string | null {
  const height = Math.max(
    bodyAltitude(f.pos, f.universalTime),
    target.mode === 'vertical' ? 0 : target.altitude
  );
  const density = atmosphere(height).density,
    area = f.stats.aero.weight;
  const minimum = Math.sqrt(
    (2 * f.stats.mass * bodyGravity(f.pos, f.universalTime).length()) /
      (density * area * 4.5 * (12 * rad) * Math.cos(20 * rad))
  );
  return !Number.isFinite(minimum) || target.speed < minimum
    ? '巡航速度不足 · 目安 ' +
        (Number.isFinite(minimum) ? Math.ceil(minimum) + ' m/s以上' : '大気・翼面積を確認')
    : null;
}
export function hasCruiseHardware(f: CruiseFlight): boolean {
  return !f.crashed && !f.rocketAxes && f.parts.some(p => PARTS[p.type].control) && f.stats.aero.weight > 0;
}
export function cruiseAuthority(f: CruiseFlight | null | undefined): string | null {
  if (!f || !hasCruiseHardware(f)) return '前方操縦・指令部品・揚力を生む翼が必要';
  if (
    !['pitch', 'roll'].every(name =>
      f.parts.some(
        p => PARTS[p.type].controlAxis && Math.abs(controlDeflection(p, f.stats.com, {[name]: 1})) > 1e-6
      )
    )
  )
    return '昇降舵・補助翼の制御が必要';
  return null;
}
export function cruiseReadiness(f: CruiseFlight): string | null {
  const authority = cruiseAuthority(f);
  if (authority) return authority;
  const up = bodyUp(f.pos, f.universalTime),
    forward = new T.Vector3(0, 0, 1).applyQuaternion(f.q),
    top = new T.Vector3(0, 1, 0).applyQuaternion(f.q);
  if (referenceBody(f.pos, f.universalTime).id !== 'planet') return '大気圏内の巡航用';
  if (!f.started || f.telemetry.contacts || bodyAltitude(f.pos, f.universalTime) < 300)
    return '離陸後、高度300 m以上で開始';
  const v = surfaceRelativeVelocity(f.pos, f.vel, f.universalTime),
    vertical = v.dot(up),
    pitch = Math.asin(clamp(forward.dot(up), -1, 1)) / rad;
  if (v.length() < 40 || Math.abs(vertical) > 15 || top.dot(up) < 0.75 || pitch < -10 || pitch > 30)
    return '姿勢と昇降率を安定させてください';
  return cruisePropulsion(f);
}
export function cruisePropulsion(f: CruiseFlight): string | null {
  let thrust = 0,
    forward = 0;
  for (const group of fuelNetworks(f.parts).groups) {
    if (!group.tanks.some(t => (f.fuel.get(t.id) || 0) > 0)) continue;
    for (const p of group.engines) {
      if (PARTS[p.type].thrustMedium !== 'air' || !f.active.has(p.id)) continue;
      const force = engineMaxThrust(p);
      thrust += force;
      forward += force * new T.Vector3(0, 1, 0).applyQuaternion(partRotation(p)).z;
    }
  }
  if (!thrust) return '点火済みの航空エンジンと燃料供給が必要';
  if (forward <= thrust * 1e-8) return '機体の前方へ推力を出すエンジン配置が必要';
  return null;
}
export class CruisePilot {
  declare duration: number;
  declare elapsed: number;
  declare faultMessage: string | undefined;
  declare owner: string;
  declare pitchBias: number;
  declare powerBias: number;
  declare previous: CruisePrevious;
  declare reason: string | undefined;
  declare running: boolean;
  declare settled: number;
  declare status: string;
  declare target: CruiseSettings;
  declare telemetry: CruiseTelemetry | undefined;
  constructor(f: CruiseFlight, settings: CruiseSettingsInput = {speed: 90, altitude: 1000, heading: 90}) {
    const {speed, altitude, heading, mode, vertical} = cruiseSettings(settings);
    if (!f.parts.length || !(f.stats.mass > 0)) throw Error('Empty aircraft');
    this.target = {speed, altitude, heading, mode, vertical};
    this.owner = f.vesselId;
    this.running = true;
    this.status = '捕捉中';
    this.duration = 0;
    this.settled = 0;
    this.previous = {sas: f.sas, sasMode: f.sasMode, trim: f.trim};
    this.pitchBias = 0;
    this.powerBias = f.throttle;
    this.elapsed = 0.1;
  }
  stop(f: CruiseFlight, reason = 'manual'): void {
    this.running = false;
    this.reason = reason;
    if (f.vesselId === this.owner) {
      Object.assign(f, this.previous);
      f.holdQ = f.q.clone();
      if (reason === 'fault') f.throttle = 0;
    }
  }
  update(f: CruiseFlight, dt: number, {manual = false}: {manual?: boolean} = {}): void {
    if (!this.running) return;
    if (f.vesselId !== this.owner) {
      this.running = false;
      this.reason = 'vessel changed';
      return;
    }
    if (manual) {
      this.stop(f);
      return;
    }
    if (!Number.isFinite(dt) || dt < 0 || f.crashed) {
      this.stop(f, 'fault');
      return;
    }
    if (dt === 0) return;
    const authority = cruiseAuthority(f) || cruisePropulsion(f);
    if (authority) {
      this.stop(f, 'fault');
      this.faultMessage = authority;
      return;
    }
    this.elapsed += dt;
    if (this.elapsed < 0.1) return;
    const elapsed = Math.min(this.elapsed, 0.2);
    this.elapsed = 0;
    const center = centerOfMass(f);
    const up = bodyUp(center, f.universalTime),
      frame = compassFrame(center, f.universalTime);
    if (!frame) {
      this.stop(f, 'fault');
      return;
    }
    const v = surfaceRelativeVelocity(center, f.vel, f.universalTime),
      speed = v.length(),
      vertical = v.dot(up);
    const height = bodyAltitude(center, f.universalTime),
      desiredVertical =
        this.target.mode === 'vertical'
          ? this.target.vertical
          : clamp((this.target.altitude - height) * 0.08, -5, 5);
    try {
      cruiseSettings(this.target);
    } catch {
      this.stop(f, 'fault');
      return;
    }
    if (![height, speed, vertical].every(Number.isFinite)) {
      this.stop(f, 'fault');
      return;
    }
    const error = desiredVertical - vertical;
    const currentHeading = compassHeading(
      new T.Vector3(0, 0, 1).applyQuaternion(f.q),
      center,
      f.universalTime
    );
    if (currentHeading === null) {
      this.stop(f, 'fault');
      return;
    }
    const headingError = ((this.target.heading - currentHeading + 540) % 360) - 180;
    const bank = clamp(headingError * 0.7, -20, 20) * rad;
    // Feed forward the lift needed to carry current mass. This uses the game's
    // pre-stall lift slope and projected wing area, not a per-preset trim angle.
    // It is an estimate: tail trim, drag and thrust moments still need feedback.
    const density = referenceBody(center, f.universalTime).id === 'planet' ? atmosphere(height).density : 0,
      area = f.stats.aero.weight;
    const liftSlope = 0.5 * density * speed * speed * area * 4.5;
    if (!(liftSlope > 0)) {
      this.stop(f, 'fault');
      return;
    }
    const gravity = bodyGravity(center, f.universalTime).length();
    const liftAngle = (f.stats.mass * gravity) / (liftSlope * Math.cos(bank));
    this.pitchBias = clamp(this.pitchBias + error * 0.04 * elapsed, -6, 6);
    const pitch = clamp(liftAngle / rad + this.pitchBias + error * 0.4, -10, 18) * rad;
    // Bound yaw demand to let a banked aircraft turn instead of commanding a snap yaw.
    const heading = (currentHeading + clamp(headingError, -5, 5)) * rad;
    const forward = frame.north
      .clone()
      .multiplyScalar(Math.cos(heading))
      .addScaledVector(frame.east, Math.sin(heading));
    const right = up.clone().cross(forward).normalize();
    forward.multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch));
    const top = forward.clone().cross(right).normalize();
    f.holdQ = new T.Quaternion()
      .setFromRotationMatrix(new T.Matrix4().makeBasis(right, top, forward))
      .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), bank));
    const speedError = this.target.speed - speed;
    this.powerBias = clamp(this.powerBias + speedError * 0.005 * elapsed, 0, 1);
    f.throttle = clamp(this.powerBias + speedError * 0.025, 0, 1);
    f.sas = true;
    f.sasMode = 'hold';
    f.trim = 0;
    this.telemetry = {
      height,
      speed,
      vertical,
      heading: currentHeading,
      pitch: pitch / rad,
      bank: bank / rad,
      throttle: f.throttle,
      liftAngle: liftAngle / rad,
      liftMargin: (12 * rad) / Math.max(liftAngle, 0.0001)
    };
    this.duration += elapsed;
    const verticalReady =
      this.target.mode === 'vertical'
        ? Math.abs(error) < 0.5
        : Math.abs(this.target.altitude - height) < 10 && Math.abs(vertical) < 0.5;
    this.settled =
      verticalReady && Math.abs(speedError) < 2 && Math.abs(headingError) < 2 ? this.settled + elapsed : 0;
    this.status = this.settled >= 3 ? '保持' : this.duration > 60 ? '目標未達' : '捕捉中';
  }
}

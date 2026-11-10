// Runway takeoff guidance: ground roll, rotation, climb and the handoff to cruise guidance.
// Commands the existing actuators only; never changes physical pose or velocity.
// Its attitude inner loop (cruiseCommands) also flies the landing approach and the runway return.
import * as T from 'three';
import {bodyUp, bodyAltitude, bodyGravity} from './celestial.js';
import {surfaceRelativeVelocity, surfaceAngularVelocity} from './surface-frame.js';
import {atmosphere} from './planet.js';
import {compassHeading} from './navigation.js';
import {CruisePilot, cruiseReadiness, cruiseSettings, cruiseTargetReadiness} from './cruise-pilot.js';
import {seedSasTrim} from './sas-trim.js';
import {runwayApproach, RUNWAY} from './runway-navigation.js';
import type {Flight} from './core.js';
const rad = Math.PI / 180,
  clamp = T.MathUtils.clamp;
export interface AutopilotCommands {
  pitch?: number;
  roll?: number;
  yaw?: number;
}
export interface TakeoffOptions {
  speed: number;
  altitude?: number;
  rotation?: number;
  integral?: boolean;
  handoff?: string;
  abortGuard?: boolean;
}
/** The climb target; heading is null where the compass is undefined (at a pole or pointing straight up). */
export interface TakeoffTarget {
  speed: number;
  altitude: number;
  heading: number | null;
  mode?: string;
  vertical?: number;
}
/** What the attitude inner loop reads from its guidance: the commanded pitch (degrees) of the latest sample. */
export interface PitchGuidance {
  running?: boolean;
  telemetry: {pitch: number} | undefined;
}
export interface TakeoffTelemetry {
  height: number;
  speed: number;
  vertical: number;
  pitch: number;
  reason?: string;
  pitchRate?: number;
  alpha?: number;
  targetPitch?: number;
  minimum?: number;
  pitchCommand?: number;
  contacts?: number;
  beforeThrottle?: number;
  afterThrottle?: number;
  handoffMode?: string;
}
export interface TakeoffAbort {
  height: number;
  speed: number;
  pitch: number;
  remaining: number;
  stoppingDistance: number;
  time: number;
}
// G is the guidance held in `cruise`. update() creates and drives a CruisePilot, so it is only
// callable with the default G; the landing approach installs a pitch-only guidance and calls
// cruiseCommands alone.
export class TakeoffPrototype<G extends PitchGuidance = CruisePilot> {
  declare abortGuard: boolean;
  declare handoffMode: string;
  declare integral: boolean;
  declare pitchBias: number;
  declare rotation: number;
  declare owner: string;
  declare target: TakeoffTarget;
  declare phase: string;
  declare elapsed: number;
  declare commands: AutopilotCommands;
  declare cruise: G | null;
  declare abort: TakeoffAbort | undefined;
  declare telemetry: TakeoffTelemetry | undefined;
  declare guidanceSample: PitchGuidance['telemetry'] | null;
  declare attitudeTarget: T.Quaternion | undefined;
  declare lateralBias: T.Vector3 | undefined;
  constructor(
    f: Flight,
    {
      speed,
      altitude = 600,
      rotation = 8,
      integral = false,
      handoff = 'direct',
      abortGuard = false
    }: TakeoffOptions
  ) {
    this.abortGuard = abortGuard;
    this.handoffMode = handoff;
    this.integral = integral;
    this.pitchBias = 0;
    this.rotation = rotation;
    this.owner = f.vesselId;
    this.target = {
      speed,
      altitude,
      heading: compassHeading(new T.Vector3(0, 0, 1).applyQuaternion(f.q), f.pos, f.universalTime)
    };
    this.phase = 'roll';
    this.elapsed = 0;
    this.commands = {};
    this.cruise = null;
  }
  update(this: TakeoffPrototype, f: Flight, dt: number): AutopilotCommands {
    if (f.vesselId !== this.owner || f.crashed || !Number.isFinite(dt) || dt < 0) {
      this.phase = 'stopped';
      return {};
    }
    if (dt === 0 || this.phase === 'stopped') return {};
    if (this.cruise) {
      if (['ramp', 'servo', 'seed', 'attitude'].includes(this.handoffMode))
        this.cruise.target.speed += clamp(this.target.speed - this.cruise.target.speed, -0.5 * dt, 0.5 * dt);
      this.cruise.update(f, dt);
      return this.cruiseCommands(f, dt);
    }
    // Fast attitude feedback must observe each physics step; holding saturated
    // control for 100 ms caused a limit cycle on the light aircraft.
    const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
      up = bodyUp(center, f.universalTime),
      v = surfaceRelativeVelocity(center, f.vel, f.universalTime);
    const height = bodyAltitude(center, f.universalTime),
      speed = v.length(),
      vertical = v.dot(up),
      density = atmosphere(height).density;
    const minimum = Math.sqrt(
      (2 * f.stats.mass * bodyGravity(center, f.universalTime).length()) /
        (density * f.stats.aero.weight * 4.5 * 12 * rad)
    );
    const pitch = Math.asin(clamp(new T.Vector3(0, 0, 1).applyQuaternion(f.q).dot(up), -1, 1)) / rad;
    const omega = f.omega.clone().sub(surfaceAngularVelocity()).applyQuaternion(f.q.clone().invert()),
      pitchRate = -omega.x / rad;
    if (this.abortGuard && ['roll', 'rotate'].includes(this.phase) && f.telemetry.contacts) {
      const runway = runwayApproach(center, f.universalTime, '09', f.vel);
      if (!runway) throw TypeError('No runway approach away from the home planet');
      const remaining = RUNWAY.length + runway.remaining;
      // Experimental margin: 6 m/s² is below the measured neutral ground braking
      // deceleration. Rotation unloads wheels, so validate the full abort separately.
      const stoppingDistance = (speed * speed) / 12 + speed * 0.5 + 50;
      if (remaining <= stoppingDistance) {
        this.phase = 'abort';
        this.abort = {height, speed, pitch, remaining, stoppingDistance, time: f.time};
      }
    }
    if (this.phase === 'abort') {
      f.throttle = 0;
      f.brake = true;
      f.trim = 0;
      this.telemetry = {height, speed, vertical, pitch, reason: 'runway stopping margin'};
      if (speed < 0.5 && f.telemetry.contacts) {
        this.phase = 'stopped';
        return {};
      }
      return this.pitchServo(f, 0, dt);
    }
    if (this.phase === 'roll' && speed > minimum * 0.95) this.phase = 'rotate';
    if (this.phase === 'rotate' && height > 30 && !f.telemetry.contacts) this.phase = 'climb';
    if (this.phase === 'climb' && height > this.target.altitude - 100) this.phase = 'capture';
    let targetPitch = this.phase === 'roll' ? 0 : this.phase === 'rotate' ? this.rotation : 12;
    if (this.phase === 'capture') {
      const lift =
        (f.stats.mass * bodyGravity(center, f.universalTime).length()) /
        (0.5 * density * speed * speed * f.stats.aero.weight * 4.5) /
        rad;
      targetPitch = clamp(
        lift + (clamp((this.target.altitude - height) * 0.05, -3, 5) - vertical) * 0.4,
        -5,
        12
      );
      if (
        height > 300 &&
        Math.abs(vertical) < 5 &&
        Math.abs(pitch) < 15 &&
        !cruiseReadiness(f) &&
        !cruiseTargetReadiness(f, this.target)
      ) {
        const beforeThrottle = f.throttle;
        // A target without a compass heading is refused by cruiseSettings, as CruisePilot would refuse it.
        this.cruise = new CruisePilot(
          f,
          cruiseSettings({
            ...this.target,
            heading: this.target.heading ?? undefined,
            speed: ['ramp', 'servo', 'seed', 'attitude'].includes(this.handoffMode)
              ? speed
              : this.target.speed
          })
        );
        if (this.handoffMode !== 'direct')
          this.cruise.powerBias = clamp(beforeThrottle - (this.cruise.target.speed - speed) * 0.025, 0, 1);
        this.phase = 'cruise';
        this.cruise.update(f, dt);
        if (this.handoffMode === 'seed') seedSasTrim(f, f.telemetry.commands);
        this.telemetry = {
          height,
          speed,
          vertical,
          pitch,
          targetPitch,
          minimum,
          beforeThrottle,
          afterThrottle: f.throttle,
          handoffMode: this.handoffMode
        };
        return this.cruiseCommands(f, dt);
      }
    }
    f.sas = false;
    f.trim = 0;
    f.brake = false;
    f.throttle = this.phase === 'capture' ? clamp(0.5 + (this.target.speed - speed) * 0.03, 0.1, 1) : 1;
    const error = pitch - targetPitch,
      raw = error * 0.2 + pitchRate * 0.12 + this.pitchBias;
    if (this.integral && (Math.abs(raw) < 1 || error * raw < 0))
      this.pitchBias = clamp(this.pitchBias + error * 0.08 * dt, -0.6, 0.6);
    this.commands = {pitch: clamp(error * 0.2 + pitchRate * 0.12 + this.pitchBias, -1, 1)};
    if ((this.phase === 'roll' || this.phase === 'rotate') && f.telemetry.contacts) {
      const runway = runwayApproach(center, f.universalTime, '09', f.vel);
      if (runway) {
        // Positive cross-track is left of runway 09. Lead lateral drift and damp body yaw.
        this.commands.yaw = clamp(
          0.03 * runway.crossTrack + 0.12 * (runway.track?.x ?? 0) - 1.5 * omega.y,
          -1,
          1
        );
      }
    }
    this.telemetry = {
      height,
      speed,
      vertical,
      pitch,
      pitchRate,
      alpha: pitch - Math.asin(clamp(vertical / Math.max(speed, 0.001), -1, 1)) / rad,
      targetPitch,
      minimum,
      pitchCommand: this.commands.pitch,
      contacts: f.telemetry.contacts
    };
    return this.commands;
  }
  cruiseCommands(f: Flight, dt: number): AutopilotCommands {
    const cruise = this.cruise;
    if (!cruise) throw TypeError('No guidance to follow');
    if (cruise.running === false) {
      this.phase = 'stopped';
      return {};
    }
    if (!['servo', 'attitude'].includes(this.handoffMode)) return {};
    // Flight refreshes holdQ while SAS is off. Retain the guidance target across
    // the faster inner-loop steps rather than accidentally chasing current pose.
    if (this.guidanceSample !== cruise.telemetry) {
      this.guidanceSample = cruise.telemetry;
      this.attitudeTarget = f.holdQ.clone();
    }
    if (!cruise.telemetry) throw TypeError('Guidance has not produced a sample');
    const commands: AutopilotCommands = this.pitchServo(f, cruise.telemetry.pitch, dt);
    if (this.handoffMode === 'attitude') {
      if (!this.attitudeTarget) throw TypeError('No attitude target retained');
      const error = this.attitudeTarget.clone().multiply(f.q.clone().invert());
      if (error.w < 0) {
        error.x *= -1;
        error.y *= -1;
        error.z *= -1;
      }
      const inverse = f.q.clone().invert(),
        local = new T.Vector3(error.x, error.y, error.z).applyQuaternion(inverse);
      const rate = f.omega.clone().sub(surfaceAngularVelocity()).applyQuaternion(inverse);
      const lateralBias = (this.lateralBias ??= new T.Vector3());
      for (const [name, axis] of [
        ['yaw', 'y'],
        ['roll', 'z']
      ] as const) {
        const base = local[axis] * 4 - rate[axis] * 1.5,
          raw = base + lateralBias[axis];
        if (Math.abs(raw) < 1 || Math.sign(local[axis]) !== Math.sign(raw))
          lateralBias[axis] = clamp(lateralBias[axis] + local[axis] * 0.8 * dt, -0.8, 0.8);
        commands[name] = clamp(base + lateralBias[axis], -1, 1);
      }
    }
    return commands;
  }
  // Elevator servo toward a commanded pitch (degrees). No heading or bank control.
  pitchServo(f: Flight, targetPitch: number, dt: number): {pitch: number} {
    const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
      up = bodyUp(center, f.universalTime);
    const pitch = Math.asin(clamp(new T.Vector3(0, 0, 1).applyQuaternion(f.q).dot(up), -1, 1)) / rad;
    const rate = -f.omega.clone().sub(surfaceAngularVelocity()).applyQuaternion(f.q.clone().invert()).x / rad,
      error = pitch - targetPitch;
    const raw = error * 0.2 + rate * 0.12 + this.pitchBias;
    if (this.integral && (Math.abs(raw) < 1 || error * raw < 0))
      this.pitchBias = clamp(this.pitchBias + error * 0.08 * dt, -0.6, 0.6);
    f.sas = false;
    return {pitch: clamp(error * 0.2 + rate * 0.12 + this.pitchBias, -1, 1)};
  }
}

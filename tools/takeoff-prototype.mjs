// Experimental guidance: normal runway start, actuator commands only.
import * as T from 'three';
import {bodyUp, bodyAltitude, bodyGravity} from '../dist/celestial.js';
import {surfaceRelativeVelocity, surfaceAngularVelocity} from '../dist/surface-frame.js';
import {atmosphere} from '../dist/planet.js';
import {compassHeading} from '../dist/navigation.js';
import {CruisePilot, cruiseReadiness, cruiseTargetReadiness} from '../dist/cruise-pilot.js';
import {seedSasTrim} from '../dist/sas-trim.js';
import {runwayApproach, RUNWAY} from '../dist/runway-navigation.js';
const rad = Math.PI / 180,
  clamp = T.MathUtils.clamp;
export class TakeoffPrototype {
  constructor(
    f,
    {speed, altitude = 600, rotation = 8, integral = false, handoff = 'direct', abortGuard = false}
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
  update(f, dt) {
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
      const runway = runwayApproach(center, f.universalTime, '09', f.vel),
        remaining = RUNWAY.length + runway.remaining;
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
        this.cruise = new CruisePilot(f, {
          ...this.target,
          speed: ['ramp', 'servo', 'seed', 'attitude'].includes(this.handoffMode) ? speed : this.target.speed
        });
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
  cruiseCommands(f, dt) {
    if (this.cruise.running === false) {
      this.phase = 'stopped';
      return {};
    }
    if (!['servo', 'attitude'].includes(this.handoffMode)) return {};
    // Flight refreshes holdQ while SAS is off. Retain the guidance target across
    // the faster inner-loop steps rather than accidentally chasing current pose.
    if (this.guidanceSample !== this.cruise.telemetry) {
      this.guidanceSample = this.cruise.telemetry;
      this.attitudeTarget = f.holdQ.clone();
    }
    const commands = this.pitchServo(f, this.cruise.telemetry.pitch, dt);
    if (this.handoffMode === 'attitude') {
      const error = this.attitudeTarget.clone().multiply(f.q.clone().invert());
      if (error.w < 0) {
        error.x *= -1;
        error.y *= -1;
        error.z *= -1;
      }
      const inverse = f.q.clone().invert(),
        local = new T.Vector3(error.x, error.y, error.z).applyQuaternion(inverse);
      const rate = f.omega.clone().sub(surfaceAngularVelocity()).applyQuaternion(inverse);
      this.lateralBias ??= new T.Vector3();
      for (const [name, axis] of [
        ['yaw', 'y'],
        ['roll', 'z']
      ]) {
        const base = local[axis] * 4 - rate[axis] * 1.5,
          raw = base + this.lateralBias[axis];
        if (Math.abs(raw) < 1 || Math.sign(local[axis]) !== Math.sign(raw))
          this.lateralBias[axis] = clamp(this.lateralBias[axis] + local[axis] * 0.8 * dt, -0.8, 0.8);
        commands[name] = clamp(base + this.lateralBias[axis], -1, 1);
      }
    }
    return commands;
  }
  // Diagnostic straight-flight comparison only: retain the takeoff elevator
  // controller while consuming the cruise guidance. No heading/bank control.
  pitchServo(f, targetPitch, dt) {
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

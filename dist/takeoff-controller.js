// tools/takeoff-session.mjs
import { cruiseAuthority, cruisePropulsion, cruiseSettings, cruiseTargetReadiness as cruiseTargetReadiness2 } from "./cruise-pilot.js";
import { surfaceRelativeVelocity as surfaceRelativeVelocity2, inertialToFixed, surfaceOrientation } from "./surface-frame.js";
import { compassHeading as compassHeading2 } from "./navigation.js";
import * as T2 from "three";
import { runwayApproach as runwayApproach2, RUNWAY as RUNWAY2 } from "./runway-navigation.js";
import { bodyAltitude as bodyAltitude2 } from "./celestial.js";

// tools/takeoff-prototype.mjs
import * as T from "three";
import { bodyUp, bodyAltitude, bodyGravity } from "./celestial.js";
import { surfaceRelativeVelocity, surfaceAngularVelocity } from "./surface-frame.js";
import { atmosphere } from "./planet.js";
import { compassHeading } from "./navigation.js";
import { CruisePilot, cruiseReadiness, cruiseTargetReadiness } from "./cruise-pilot.js";
import { seedSasTrim } from "./sas-trim.js";
import { runwayApproach, RUNWAY } from "./runway-navigation.js";
var rad = Math.PI / 180;
var clamp = T.MathUtils.clamp;
var TakeoffPrototype = class {
  constructor(f, { speed, altitude = 600, rotation = 8, integral = false, handoff = "direct", abortGuard = false }) {
    this.abortGuard = abortGuard;
    this.handoffMode = handoff;
    this.integral = integral;
    this.pitchBias = 0;
    this.rotation = rotation;
    this.owner = f.vesselId;
    this.target = { speed, altitude, heading: compassHeading(new T.Vector3(0, 0, 1).applyQuaternion(f.q), f.pos, f.universalTime) };
    this.phase = "roll";
    this.elapsed = 0;
    this.commands = {};
    this.cruise = null;
  }
  update(f, dt) {
    if (f.vesselId !== this.owner || f.crashed || !Number.isFinite(dt) || dt < 0) {
      this.phase = "stopped";
      return {};
    }
    if (dt === 0 || this.phase === "stopped") return {};
    if (this.cruise) {
      if (["ramp", "servo", "seed", "attitude"].includes(this.handoffMode)) this.cruise.target.speed += clamp(this.target.speed - this.cruise.target.speed, -0.5 * dt, 0.5 * dt);
      this.cruise.update(f, dt);
      return this.cruiseCommands(f, dt);
    }
    const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), up = bodyUp(center, f.universalTime), v = surfaceRelativeVelocity(center, f.vel, f.universalTime);
    const height = bodyAltitude(center, f.universalTime), speed = v.length(), vertical = v.dot(up), density2 = atmosphere(height).density;
    const minimum = Math.sqrt(2 * f.stats.mass * bodyGravity(center, f.universalTime).length() / (density2 * f.stats.aero.weight * 4.5 * 12 * rad));
    const pitch = Math.asin(clamp(new T.Vector3(0, 0, 1).applyQuaternion(f.q).dot(up), -1, 1)) / rad;
    const omega = f.omega.clone().sub(surfaceAngularVelocity()).applyQuaternion(f.q.clone().invert()), pitchRate = -omega.x / rad;
    if (this.abortGuard && ["roll", "rotate"].includes(this.phase) && f.telemetry.contacts) {
      const runway = runwayApproach(center, f.universalTime, "09", f.vel), remaining = RUNWAY.length + runway.remaining;
      const stoppingDistance = speed * speed / 12 + speed * 0.5 + 50;
      if (remaining <= stoppingDistance) {
        this.phase = "abort";
        this.abort = { height, speed, pitch, remaining, stoppingDistance, time: f.time };
      }
    }
    if (this.phase === "abort") {
      f.throttle = 0;
      f.brake = true;
      f.trim = 0;
      this.telemetry = { height, speed, vertical, pitch, reason: "runway stopping margin" };
      if (speed < 0.5 && f.telemetry.contacts) {
        this.phase = "stopped";
        return {};
      }
      return this.pitchServo(f, 0, dt);
    }
    if (this.phase === "roll" && speed > minimum * 0.95) this.phase = "rotate";
    if (this.phase === "rotate" && height > 30 && !f.telemetry.contacts) this.phase = "climb";
    if (this.phase === "climb" && height > this.target.altitude - 100) this.phase = "capture";
    let targetPitch = this.phase === "roll" ? 0 : this.phase === "rotate" ? this.rotation : 12;
    if (this.phase === "capture") {
      const lift = f.stats.mass * bodyGravity(center, f.universalTime).length() / (0.5 * density2 * speed * speed * f.stats.aero.weight * 4.5) / rad;
      targetPitch = clamp(lift + (clamp((this.target.altitude - height) * 0.05, -3, 5) - vertical) * 0.4, -5, 12);
      if (height > 300 && Math.abs(vertical) < 5 && Math.abs(pitch) < 15 && !cruiseReadiness(f) && !cruiseTargetReadiness(f, this.target)) {
        const beforeThrottle = f.throttle;
        this.cruise = new CruisePilot(f, { ...this.target, speed: ["ramp", "servo", "seed", "attitude"].includes(this.handoffMode) ? speed : this.target.speed });
        if (this.handoffMode !== "direct") this.cruise.powerBias = clamp(beforeThrottle - (this.cruise.target.speed - speed) * 0.025, 0, 1);
        this.phase = "cruise";
        this.cruise.update(f, dt);
        if (this.handoffMode === "seed") seedSasTrim(f, f.telemetry.commands);
        this.telemetry = { height, speed, vertical, pitch, targetPitch, minimum, beforeThrottle, afterThrottle: f.throttle, handoffMode: this.handoffMode };
        return this.cruiseCommands(f, dt);
      }
    }
    f.sas = false;
    f.trim = 0;
    f.brake = false;
    f.throttle = this.phase === "capture" ? clamp(0.5 + (this.target.speed - speed) * 0.03, 0.1, 1) : 1;
    const error = pitch - targetPitch, raw = error * 0.2 + pitchRate * 0.12 + this.pitchBias;
    if (this.integral && (Math.abs(raw) < 1 || error * raw < 0)) this.pitchBias = clamp(this.pitchBias + error * 0.08 * dt, -0.6, 0.6);
    this.commands = { pitch: clamp(error * 0.2 + pitchRate * 0.12 + this.pitchBias, -1, 1) };
    this.telemetry = { height, speed, vertical, pitch, pitchRate, alpha: pitch - Math.asin(clamp(vertical / Math.max(speed, 1e-3), -1, 1)) / rad, targetPitch, minimum, pitchCommand: this.commands.pitch, contacts: f.telemetry.contacts };
    return this.commands;
  }
  cruiseCommands(f, dt) {
    if (this.cruise.running === false) {
      this.phase = "stopped";
      return {};
    }
    if (!["servo", "attitude"].includes(this.handoffMode)) return {};
    if (this.guidanceSample !== this.cruise.telemetry) {
      this.guidanceSample = this.cruise.telemetry;
      this.attitudeTarget = f.holdQ.clone();
    }
    const commands = this.pitchServo(f, this.cruise.telemetry.pitch, dt);
    if (this.handoffMode === "attitude") {
      const error = this.attitudeTarget.clone().multiply(f.q.clone().invert());
      if (error.w < 0) {
        error.x *= -1;
        error.y *= -1;
        error.z *= -1;
      }
      const inverse = f.q.clone().invert(), local = new T.Vector3(error.x, error.y, error.z).applyQuaternion(inverse);
      const rate = f.omega.clone().sub(surfaceAngularVelocity()).applyQuaternion(inverse);
      this.lateralBias ??= new T.Vector3();
      for (const [name, axis] of [["yaw", "y"], ["roll", "z"]]) {
        const base = local[axis] * 4 - rate[axis] * 1.5, raw = base + this.lateralBias[axis];
        if (Math.abs(raw) < 1 || Math.sign(local[axis]) !== Math.sign(raw)) this.lateralBias[axis] = clamp(this.lateralBias[axis] + local[axis] * 0.8 * dt, -0.8, 0.8);
        commands[name] = clamp(base + this.lateralBias[axis], -1, 1);
      }
    }
    return commands;
  }
  // Diagnostic straight-flight comparison only: retain the takeoff elevator
  // controller while consuming the cruise guidance. No heading/bank control.
  pitchServo(f, targetPitch, dt) {
    const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), up = bodyUp(center, f.universalTime);
    const pitch = Math.asin(clamp(new T.Vector3(0, 0, 1).applyQuaternion(f.q).dot(up), -1, 1)) / rad;
    const rate = -f.omega.clone().sub(surfaceAngularVelocity()).applyQuaternion(f.q.clone().invert()).x / rad, error = pitch - targetPitch;
    const raw = error * 0.2 + rate * 0.12 + this.pitchBias;
    if (this.integral && (Math.abs(raw) < 1 || error * raw < 0)) this.pitchBias = clamp(this.pitchBias + error * 0.08 * dt, -0.6, 0.6);
    f.sas = false;
    return { pitch: clamp(error * 0.2 + rate * 0.12 + this.pitchBias, -1, 1) };
  }
};

// tools/takeoff-session.mjs
var TAKEOFF_END_MARGIN = 75;
function departureReadiness(f, target) {
  const problem = cruiseAuthority(f) || cruisePropulsion(f);
  if (problem) return problem;
  if (f.environment !== "runway" || !f.telemetry.contacts || bodyAltitude2(f.pos, f.universalTime) > 20) return "\u6ED1\u8D70\u8DEF\u4E0A\u3067\u6E96\u5099\u3057\u3066\u304F\u3060\u3055\u3044";
  if (surfaceRelativeVelocity2(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), f.vel, f.universalTime).length() > 0.5 || f.throttle !== 0 || !f.brake) return "\u505C\u6B62\u30FB\u63A8\u529B\u30BC\u30ED\u30FB\u30D6\u30EC\u30FC\u30AD\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044";
  const r = runwayApproach2(f.pos, f.universalTime, "09", f.vel);
  if (!r || -r.remaining < 0 || -r.remaining > RUNWAY2.length || Math.abs(r.crossTrack) > RUNWAY2.width / 2) return "\u6ED1\u8D70\u8DEF\u306E\u5185\u5074\u3067\u6E96\u5099\u3057\u3066\u304F\u3060\u3055\u3044";
  const heading = compassHeading2(new T2.Vector3(0, 0, 1).applyQuaternion(f.q), f.pos, f.universalTime);
  if (heading === null || Math.abs((heading - 90 + 540) % 360 - 180) > 2) return "\u6ED1\u8D70\u8DEF09\u3078\u6A5F\u9996\u3092\u5408\u308F\u305B\u3066\u304F\u3060\u3055\u3044";
  if (target.mode !== "altitude") return "\u96E2\u9678\u76EE\u6A19\u306B\u306F\u9AD8\u5EA6\u4FDD\u6301\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044";
  return cruiseTargetReadiness2(f, target);
}
var fingerprint = (f) => JSON.stringify({ parts: f.parts, fuel: [...f.fuel], active: [...f.active], ballast: f.ballast, reaction: f.reactionEnabled, steering: f.steeringEnabled, drive: f.driveEnabled, trim: f.trim, sas: f.sas, sasMode: f.sasMode });
var pose = (f) => ({ position: inertialToFixed(f.pos, f.universalTime), rotation: surfaceOrientation(f.universalTime).invert().multiply(f.q) });
var matchesPose = (f, before) => {
  const now = pose(f);
  return now.position.distanceTo(before.position) < 0.5 && now.rotation.angleTo(before.rotation) < Math.PI / 360;
};
var TakeoffSession = class {
  constructor(client) {
    this.client = client;
    this.generation = 0;
    this.state = "idle";
    this.prepared = null;
  }
  cancel() {
    this.generation++;
    this.client.cancel();
    this.prepared = null;
    this.state = "idle";
  }
  async prepare(f, settings) {
    this.cancel();
    const generation = this.generation, target = cruiseSettings(settings), problem = departureReadiness(f, target);
    if (problem) throw Error(problem);
    const pilot = new TakeoffPrototype(f, { ...target, rotation: 12, integral: true, handoff: "attitude" });
    pilot.target = { ...target };
    const stamp = fingerprint(f), initialPose = pose(f);
    this.state = "predicting";
    try {
      const result = await this.client.request(f, pilot, { seconds: 40 });
      if (generation !== this.generation) return { status: "cancelled" };
      if (["cancelled", "stale"].includes(result.status) || stamp !== fingerprint(f) || !matchesPose(f, initialPose) || departureReadiness(f, target)) {
        this.state = "idle";
        return { status: "stale" };
      }
      const track = result.wheelTrack;
      if (result.status !== "airborne" || !track || !["minAlong", "maxAlong", "maxCross", "samples"].every((k) => Number.isFinite(track[k])) || track.samples <= 0 || track.minAlong < 0 || track.maxAlong > RUNWAY2.length - TAKEOFF_END_MARGIN || track.maxCross > RUNWAY2.width / 2) {
        this.state = "rejected";
        return { ...result, accepted: false };
      }
      this.prepared = { f, stamp, target, result, initialPose, epoch: f.universalTime };
      this.state = "ready";
      return { ...result, accepted: true };
    } catch (error) {
      if (generation !== this.generation) return { status: "cancelled" };
      this.state = "idle";
      this.prepared = null;
      throw error;
    }
  }
  readyFor(f, settings) {
    const ready = this.prepared;
    if (this.state !== "ready" || !ready) return false;
    const valid = ready.f === f && fingerprint(f) === ready.stamp && matchesPose(f, ready.initialPose) && JSON.stringify(cruiseSettings(settings)) === JSON.stringify(ready.target) && f.universalTime >= ready.epoch && f.universalTime - ready.epoch <= 5 && !departureReadiness(f, ready.target);
    if (!valid) this.cancel();
    return valid;
  }
  start(f, settings) {
    const target = cruiseSettings(settings);
    if (!this.readyFor(f, target)) {
      this.cancel();
      throw Error("\u72B6\u614B\u304C\u5909\u308F\u308A\u307E\u3057\u305F\u3002\u96E2\u9678\u3092\u518D\u4E88\u6E2C\u3057\u3066\u304F\u3060\u3055\u3044");
    }
    this.prepared = null;
    this.state = "running";
    const pilot = new TakeoffPrototype(f, { ...target, rotation: 12, integral: true, handoff: "attitude" });
    pilot.target = { ...target };
    return pilot;
  }
};

// tools/takeoff-preview.mjs
import { saveFlight, loadFlight } from "./flight-save.js";
import { runwayApproach as runwayApproach3 } from "./runway-navigation.js";
import { extendWheelTrack } from "./runway-wheel-track.js";
function createTakeoffRequest(f, p, { seconds = 20, hz = 120 } = {}) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60 || ![60, 120].includes(hz)) throw Error("Invalid forecast horizon");
  if (p.owner !== f.vesselId || !["roll", "rotate"].includes(p.phase)) throw Error("Forecast requires the owned departure");
  return { flight: saveFlight(f), pilot: { target: { ...p.target }, rotation: p.rotation, integral: p.integral, handoffMode: p.handoffMode, phase: p.phase, pitchBias: p.pitchBias }, seconds, hz };
}

// tools/takeoff-preview-client.mjs
var TakeoffPreviewClient = class {
  constructor(makeWorker, { timeoutMs = 15e3, maxAge = 5 } = {}) {
    this.makeWorker = makeWorker;
    this.timeoutMs = timeoutMs;
    this.maxAge = maxAge;
    this.sequence = 0;
    this.pending = null;
  }
  cancel() {
    const old = this.pending;
    this.pending = null;
    if (old) {
      clearTimeout(old.timer);
      old.worker.terminate();
      old.resolve({ status: "cancelled" });
    }
  }
  request(f, p, options = {}) {
    const payload = createTakeoffRequest(f, p, options);
    this.cancel();
    const id = ++this.sequence, vesselId = f.vesselId, epoch = f.universalTime;
    return new Promise((resolve, reject) => {
      let worker;
      try {
        worker = this.makeWorker();
      } catch (error) {
        reject(error);
        return;
      }
      const pending = { worker, resolve, reject, id, vesselId, epoch };
      this.pending = pending;
      const finish = (error, result) => {
        if (this.pending !== pending) return;
        this.pending = null;
        clearTimeout(pending.timer);
        worker.terminate();
        error ? reject(error) : resolve(result);
      };
      pending.timer = setTimeout(() => finish(Error("Takeoff forecast timed out")), this.timeoutMs);
      worker.onmessage = ({ data }) => {
        if (this.pending !== pending) return;
        if (data.type === "ready" && !pending.sent) {
          pending.sent = true;
          try {
            worker.postMessage({ id, vesselId, epoch, payload });
          } catch (error) {
            finish(error);
          }
          return;
        }
        if (!pending.sent) return;
        if (this.pending !== pending || data.id !== id || data.vesselId !== vesselId || data.epoch !== epoch) return;
        if (f.vesselId !== vesselId || f.universalTime < epoch || f.universalTime - epoch > this.maxAge) {
          finish(null, { status: "stale" });
          return;
        }
        if (data.error) {
          finish(Error(data.error));
          return;
        }
        const r = data.result;
        if (!r || !["airborne", "crashed", "unresolved"].includes(r.status) || r.status === "airborne" && (!r.lastGround || !["along", "cross", "time"].every((k) => Number.isFinite(r.lastGround[k])))) {
          finish(Error("Invalid forecast result"));
          return;
        }
        finish(null, { ...r, vesselId, epoch });
      };
      worker.onerror = () => finish(Error("Takeoff forecast worker failed"));
    });
  }
};

// tools/landing-session.mjs
import * as T6 from "three";
import { CruisePilot as CruisePilot2, cruiseReadiness as cruiseReadiness2, cruiseTargetReadiness as cruiseTargetReadiness3, cruiseAuthority as cruiseAuthority2, cruisePropulsion as cruisePropulsion2 } from "./cruise-pilot.js";
import { bodyAltitude as bodyAltitude5, bodyUp as bodyUp3, referenceBody } from "./celestial.js";
import { surfaceRelativeVelocity as surfaceRelativeVelocity4 } from "./surface-frame.js";
import { compassHeading as compassHeading4 } from "./navigation.js";
import { runwayApproach as runwayApproach5 } from "./runway-navigation.js";
import { PARTS as PARTS3 } from "./catalog.js";

// tools/landing-plan-client.mjs
import { saveFlight as saveFlight2 } from "./flight-save.js";
import { bodyAltitude as bodyAltitude3 } from "./celestial.js";
import { atmosphere as atmosphere2 } from "./planet.js";
var density = (f) => atmosphere2(bodyAltitude3(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), f.universalTime)).density;
var configuration = (f) => JSON.stringify({ parts: f.parts, active: [...f.active], ballast: f.ballast, reaction: f.reactionEnabled, steering: f.steeringEnabled });
function landingPlanContext(f) {
  return { vesselId: f.vesselId, epoch: f.universalTime, configuration: configuration(f), mass: f.stats.mass, com: f.stats.com.clone(), density: density(f) };
}
function landingPlanCurrent(f, c) {
  return !f.crashed && f.vesselId === c.vesselId && f.universalTime >= c.epoch && f.universalTime - c.epoch <= 30 && configuration(f) === c.configuration && Math.abs(f.stats.mass / c.mass - 1) <= 0.01 && f.stats.com.distanceTo(c.com) < 0.05 && Math.abs(density(f) / c.density - 1) <= 0.05;
}
function validLandingPlan(p) {
  return p && ["speed", "alpha", "pitchCommand", "throttle", "density", "gravity", "mass", "minimumSample"].every((k) => Number.isFinite(p[k])) && p.speed >= 40 && p.speed <= 168 && p.alpha >= 0 && p.alpha <= 12 && Math.abs(p.pitchCommand) <= 0.8 && p.throttle >= 0 && p.throttle <= 1 && p.density > 0 && p.gravity > 0 && p.mass > 0 && p.minimumSample >= 40 && p.minimumSample <= 160;
}
function landingPlanMatches(p, c) {
  return validLandingPlan(p) && Math.abs(p.mass / c.mass - 1) < 1e-3 && Math.abs(p.density / c.density - 1) < 1e-3;
}
var LandingPlanClient = class {
  constructor(makeWorker, { timeoutMs = 3e4 } = {}) {
    this.makeWorker = makeWorker;
    this.timeoutMs = timeoutMs;
    this.sequence = 0;
    this.pending = null;
  }
  cancel() {
    const p = this.pending;
    this.pending = null;
    if (p) {
      clearTimeout(p.timer);
      p.worker.terminate();
      p.resolve({ status: "cancelled" });
    }
  }
  request(f) {
    this.cancel();
    const context = landingPlanContext(f), flight = saveFlight2(f), id = ++this.sequence, { vesselId, epoch } = context;
    return new Promise((resolve, reject) => {
      let worker;
      try {
        worker = this.makeWorker();
      } catch (error) {
        reject(error);
        return;
      }
      const p = { worker, resolve };
      this.pending = p;
      const finish = (error, result) => {
        if (this.pending !== p) return;
        this.pending = null;
        clearTimeout(p.timer);
        worker.terminate();
        error ? reject(error) : resolve(result);
      };
      p.timer = setTimeout(() => finish(Error("Landing planning timed out")), this.timeoutMs);
      worker.onmessage = ({ data }) => {
        if (this.pending !== p) return;
        if (data.type === "ready" && !p.sent) {
          p.sent = true;
          try {
            worker.postMessage({ id, vesselId, epoch, flight });
          } catch (error) {
            finish(error);
          }
          return;
        }
        if (!p.sent || data.id !== id || data.vesselId !== vesselId || data.epoch !== epoch) return;
        if (!landingPlanCurrent(f, context)) {
          finish(null, { status: "stale" });
          return;
        }
        if (data.error) {
          finish(Error(data.error));
          return;
        }
        const result = data.result;
        if (!result || !["ready", "unavailable"].includes(result.status) || result.status === "ready" && !landingPlanMatches(result.plan, context)) {
          finish(Error("Invalid landing plan"));
          return;
        }
        finish(null, { ...result, context });
      };
      worker.onerror = () => finish(Error("Landing planning worker failed"));
    });
  }
};

// tools/landing-prototype.mjs
import * as T5 from "three";
import { bodyUp as bodyUp2, bodyAltitude as bodyAltitude4, bodyGravity as bodyGravity2 } from "./celestial.js";
import { surfaceRelativeVelocity as surfaceRelativeVelocity3, surfaceAngularVelocity as surfaceAngularVelocity3 } from "./surface-frame.js";
import { compassFrame, compassHeading as compassHeading3 } from "./navigation.js";
import { runwayApproach as runwayApproach4, RUNWAY as RUNWAY3 } from "./runway-navigation.js";
import { atmosphere as atmosphere3 } from "./planet.js";
import { PARTS as PARTS2 } from "./catalog.js";
import { partCenter as partCenter2 } from "./aero.js";
import { extendWheelTrack as extendWheelTrack2 } from "./runway-wheel-track.js";

// tools/rollout-control.mjs
var RolloutControl = class {
  constructor() {
    this.elapsed = 0;
    this.braking = false;
  }
  step({ speed, pitchRate, remaining }, dt) {
    if (![speed, pitchRate, remaining, dt].every(Number.isFinite) || speed < 0 || dt < 0) {
      this.braking = true;
      return { brake: true, pitch: 0, invalid: true };
    }
    const delay = Math.max(0, 1 - this.elapsed);
    const required = speed * speed / 12 + speed * delay + 75;
    if (dt > 0) {
      this.braking ||= delay === 0 || remaining <= required;
      this.elapsed += dt;
    }
    return { brake: this.braking, pitch: Math.max(-0.5, Math.min(0.5, pitchRate * 0.12)), required, delay };
  }
};

// tools/roll-servo.mjs
import * as T3 from "three";
import { surfaceAngularVelocity as surfaceAngularVelocity2 } from "./surface-frame.js";
function rollServo(f, target, gain = 4) {
  const inverse = f.q.clone().invert(), error = target.clone().multiply(inverse);
  if (error.w < 0) {
    error.x *= -1;
    error.y *= -1;
    error.z *= -1;
  }
  const local = new T3.Vector3(error.x, error.y, error.z).applyQuaternion(inverse);
  const rate = f.omega.clone().sub(surfaceAngularVelocity2()).applyQuaternion(inverse);
  return T3.MathUtils.clamp(local.z * gain - rate.z * 1.5, -1, 1);
}

// tools/landing-trim.mjs
import * as T4 from "three";
import { PARTS } from "./catalog.js";
import { partRotation, partCenter, aeroPoint, surfaceForce, controlDeflection } from "./aero.js";
import { engineMaxThrust, fuelNetworks } from "./resources.js";
import { bodyDrag } from "./body-drag.js";
var rad2 = Math.PI / 180;
function planLandingTrim(f, { density: density2 = 1.225, gravity = 9.81 } = {}) {
  for (let speed = 40; speed <= 160; speed += 2) {
    if (!landingTrim(f, { speed, density: density2, gravity })) continue;
    const selected = landingTrim(f, { speed: speed * 1.05, density: density2, gravity });
    if (selected) return { ...selected, minimumSample: speed, density: density2, gravity, mass: f.stats.mass };
  }
  return null;
}
function trimForces(f, { speed, alpha, pitchCommand, density: density2 = 1.225, gravity = 9.81, slope = -3 }) {
  const flow = new T4.Vector3(0, -Math.sin(alpha * rad2), Math.cos(alpha * rad2)), velocity = flow.clone().multiplyScalar(speed);
  const pitch = (alpha + slope) * rad2, up = new T4.Vector3(0, Math.cos(pitch), Math.sin(pitch));
  const force = bodyDrag(f.bodyAerodynamics, new T4.Quaternion(), velocity, density2).force, torque = new T4.Vector3();
  let stalled = false;
  for (const p of f.parts) {
    if (!PARTS[p.type].wing) continue;
    const a = surfaceForce(p, partRotation(p), velocity, density2, controlDeflection(p, f.stats.com, { pitch: pitchCommand }));
    force.add(a.force);
    torque.add(aeroPoint(p).sub(f.stats.com).cross(a.force));
    stalled ||= a.stalled;
  }
  const thrust = new T4.Vector3(), thrustTorque = new T4.Vector3();
  for (const group of fuelNetworks(f.parts).groups) {
    if (!group.tanks.some((p) => (f.fuel.get(p.id) || 0) > 0)) continue;
    for (const p of group.engines) {
      if (!PARTS[p.type].air || !f.active.has(p.id)) continue;
      const engine = new T4.Vector3(0, 1, 0).applyQuaternion(partRotation(p)).multiplyScalar(engineMaxThrust(p) * density2 / 1.225);
      thrust.add(engine);
      thrustTorque.add(partCenter(p).sub(f.stats.com).cross(engine));
    }
  }
  const available = thrust.dot(flow), throttle = available > 0 ? (f.stats.mass * gravity * Math.sin(slope * rad2) - force.dot(flow)) / available : Infinity;
  force.addScaledVector(thrust, throttle);
  torque.addScaledVector(thrustTorque, throttle);
  return { speed, alpha, pitchCommand, throttle, stalled, liftError: force.dot(up) - f.stats.mass * gravity, pitchTorque: torque.x };
}
function pitchTrim(f, options) {
  let lo = -0.8, hi = 0.8, left2 = trimForces(f, { ...options, pitchCommand: lo }), right = trimForces(f, { ...options, pitchCommand: hi });
  if (!Number.isFinite(left2.pitchTorque) || left2.pitchTorque * right.pitchTorque > 0) return null;
  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2, value = trimForces(f, { ...options, pitchCommand: mid });
    if (value.pitchTorque * left2.pitchTorque > 0) {
      lo = mid;
      left2 = value;
    } else hi = mid;
  }
  return trimForces(f, { ...options, pitchCommand: (lo + hi) / 2 });
}
function landingTrim(f, { speed, density: density2 = 1.225, gravity = 9.81, slope = -3 } = {}) {
  let previous = null;
  for (let alpha = 0; alpha <= 12; alpha += 0.5) {
    const value = pitchTrim(f, { speed, alpha, density: density2, gravity, slope });
    if (value && previous && value.liftError * previous.liftError <= 0) {
      let lo = previous.alpha, hi = alpha, result = value;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        result = pitchTrim(f, { speed, alpha: mid, density: density2, gravity, slope });
        if (!result) return null;
        if (result.liftError * previous.liftError > 0) lo = mid;
        else hi = mid;
      }
      return !result.stalled && result.throttle >= 0 && result.throttle <= 1 ? result : null;
    }
    previous = value;
  }
  return null;
}

// tools/landing-prototype.mjs
var rad3 = Math.PI / 180;
var clamp2 = T5.MathUtils.clamp;
var LandingPrototype = class {
  constructor(f, { end = "09", rolloutControl = true, rollIntegral = false, lateralMode = "acceleration", lateralTime = 8, rollGain = 12, speedFloor = 90, approachAlpha = 8, useTrimPlan = true, preparedPlan, preparedContext } = {}) {
    if (!["09", "27"].includes(end)) throw Error("Unknown runway end");
    this.end = end;
    this.heading = end === "27" ? 270 : 90;
    this.approachAlpha = approachAlpha;
    this.speedFloor = speedFloor;
    this.rollGain = rollGain;
    this.lateralTime = lateralTime;
    this.lateralMode = lateralMode;
    this.rollIntegral = rollIntegral;
    this.owner = f.vesselId;
    this.phase = "approach";
    this.elapsed = 1;
    this.powerBias = f.throttle;
    this.verticalBias = 0;
    this.rolloutControl = rolloutControl ? new RolloutControl() : null;
    this.inner = new TakeoffPrototype(f, { speed: 90, integral: true, handoff: "attitude" });
    this.inner.cruise = { running: true, telemetry: { pitch: 0 } };
    if (useTrimPlan) {
      const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
      if (preparedPlan !== void 0) {
        if (!preparedContext || !landingPlanMatches(preparedPlan, preparedContext) || !landingPlanCurrent(f, preparedContext)) throw Error("Landing plan no longer applies");
        this.trimPlan = structuredClone(preparedPlan);
      } else this.trimPlan = planLandingTrim(f, { density: atmosphere3(bodyAltitude4(center, f.universalTime)).density, gravity: bodyGravity2(center, f.universalTime).length() });
      this.commandedSpeed = surfaceRelativeVelocity3(center, f.vel, f.universalTime).length();
      if (!this.trimPlan) {
        this.phase = "failed";
        this.reason = "no longitudinal trim in search range";
      }
    }
  }
  update(f, dt) {
    if (f.vesselId !== this.owner || f.crashed || !Number.isFinite(dt) || dt < 0) {
      this.phase = "failed";
      return {};
    }
    if (dt === 0 || ["stopped", "failed"].includes(this.phase)) return {};
    const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), up = bodyUp2(center, f.universalTime);
    const h = bodyAltitude4(center, f.universalTime), v = surfaceRelativeVelocity3(center, f.vel, f.universalTime), speed = v.length(), vs = v.dot(up);
    const r = runwayApproach4(center, f.universalTime, this.end, f.vel), heading = compassHeading3(new T5.Vector3(0, 0, 1).applyQuaternion(f.q), center, f.universalTime);
    const headingError = (this.heading - heading + 540) % 360 - 180;
    const groundHeight = Math.max(...f.parts.filter((p) => PARTS2[p.type].wheel).map((p) => PARTS2[p.type].size[1] / 2 - partCenter2(p).y + f.stats.com.y)) + 0.12;
    const agl = h - groundHeight;
    const wheelHalfSpan = Math.max(...f.parts.filter((p) => PARTS2[p.type].wheel).map((p) => Math.abs(partCenter2(p).x - f.stats.com.x) + PARTS2[p.type].size[0] / 2));
    this.track = extendWheelTrack2(this.track, f.telemetry.wheelContacts || []);
    if (f.telemetry.contacts && agl < 5 && this.phase !== "go-around") this.phase = "rollout";
    if (this.phase === "rollout") {
      f.throttle = 0;
      f.brake = true;
      f.sas = false;
      f.trim = 0;
      if (speed < 0.5 && f.landed) {
        const inside = this.track && this.track.minAlong >= 0 && this.track.maxAlong <= RUNWAY3.length && this.track.maxCross <= RUNWAY3.width / 2;
        this.phase = inside ? "stopped" : "failed";
        if (!inside) this.reason = "off-runway touchdown";
      }
      this.telemetry = { h, agl, speed, vs, remaining: r.remaining, cross: r.crossTrack, heading };
      const angular = f.omega.clone().sub(surfaceAngularVelocity3()).applyQuaternion(f.q.clone().invert());
      const control = this.rolloutControl?.step({ speed, pitchRate: -angular.x / rad3, remaining: RUNWAY3.length + r.remaining }, dt);
      if (control && this.phase === "rollout") f.brake = control.brake;
      const yawRate = angular.y;
      return { pitch: control?.pitch ?? 0, roll: 0, yaw: clamp2(-headingError * 0.05 + r.crossTrack * 0.03 - yawRate * 1.5, -1, 1) };
    }
    const actualPitch = Math.asin(clamp2(new T5.Vector3(0, 0, 1).applyQuaternion(f.q).dot(up), -1, 1)) / rad3;
    const pitchShortfall = (this.inner.cruise.telemetry.pitch ?? actualPitch) - actualPitch;
    const lostVerticalControl = vs < -8 && (f.telemetry.commands?.pitch ?? 0) < -0.95 && pitchShortfall > 3;
    this.sinkDuration = lostVerticalControl ? (this.sinkDuration ?? 0) + dt : 0;
    if (this.phase === "approach") {
      const reasons = [];
      if (this.sinkDuration > 2 || agl < 100 && r.remaining < 2e3 && vs < -8) reasons.push("sink-rate");
      if (agl < 100 && r.remaining < 2e3) {
        if (Math.abs(r.crossTrack) > 40) reasons.push("cross-track");
        if (Math.abs(headingError) > 15) reasons.push("heading");
        if (agl < 30 && Math.abs(r.crossTrack) + wheelHalfSpan > RUNWAY3.width / 2) reasons.push("wheel-clearance");
        if (r.remaining < -(RUNWAY3.length - speed * speed / 12 - 150)) reasons.push("stopping-distance");
      }
      if (reasons.length) {
        this.phase = "go-around";
        this.reason = "unstable final";
        this.abort = { reasons, time: f.time, agl, speed, vs, pitchShortfall, controlLossDuration: this.sinkDuration, cross: r.crossTrack, remaining: r.remaining, heading };
      }
    }
    this.elapsed += dt;
    if (this.elapsed >= 0.1) {
      const elapsed = this.elapsed;
      this.elapsed = 0;
      const density2 = atmosphere3(h).density, g = bodyGravity2(center, f.universalTime).length(), area = f.stats.aero.weight;
      const selectedSpeed = this.trimPlan?.speed ?? Math.max(this.speedFloor, Math.sqrt(2 * f.stats.mass * g / (density2 * area * 4.5 * this.approachAlpha * rad3)));
      if (this.trimPlan) this.commandedSpeed += clamp2(selectedSpeed - this.commandedSpeed, -0.5 * elapsed, 0.5 * elapsed);
      const approachSpeed = this.trimPlan ? this.commandedSpeed : selectedSpeed;
      const desiredHeight = groundHeight + Math.max(0, (r.remaining + 180) * Math.tan(3 * rad3));
      const sink = agl < 8 ? -clamp2(agl * 0.3, 1, 3) : clamp2(-speed * Math.tan(3 * rad3) + (desiredHeight - h) * 0.08, -6, 3);
      const targetVs = this.phase === "go-around" ? 5 : sink, error = targetVs - vs;
      this.verticalBias = clamp2(this.verticalBias + error * 0.04 * elapsed, -6, 6);
      const lift = f.stats.mass * g / (0.5 * density2 * speed * speed * area * 4.5);
      const pitch = clamp2(lift / rad3 + Math.asin(clamp2(targetVs / Math.max(speed, 1), -0.5, 0.5)) / rad3 + this.verticalBias + error * 0.4, -8, 15);
      const targetHeading = this.heading - clamp2(Math.atan2(r.crossTrack + (r.track?.x ?? 0) * 8, Math.max(500, speed * 8)) / rad3, -30, 30);
      const turn = (targetHeading - heading + 540) % 360 - 180;
      const crossRate = r.track?.x ?? 0, alongRate = -(r.track?.y ?? -speed);
      const course = this.heading + Math.atan2(crossRate, Math.max(alongRate, 1)) / rad3;
      const acceleration = -r.crossTrack / (this.lateralTime * this.lateralTime) - 2 * crossRate / this.lateralTime;
      const bank = this.lateralMode === "acceleration" ? clamp2(Math.atan2(acceleration, g), -20 * rad3, 20 * rad3) : clamp2(turn * 0.7, -20, 20) * rad3;
      const yawError = this.lateralMode === "acceleration" ? (course - heading + 540) % 360 - 180 : turn;
      const frame = compassFrame(center, f.universalTime), yaw = (heading + clamp2(yawError, -5, 5)) * rad3;
      const forward = frame.north.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(frame.east, Math.sin(yaw)), right = up.clone().cross(forward).normalize();
      forward.multiplyScalar(Math.cos(pitch * rad3)).addScaledVector(up, Math.sin(pitch * rad3));
      f.holdQ = new T5.Quaternion().setFromRotationMatrix(new T5.Matrix4().makeBasis(right, forward.clone().cross(right).normalize(), forward)).multiply(new T5.Quaternion().setFromAxisAngle(new T5.Vector3(0, 0, 1), bank));
      this.inner.cruise.telemetry = { pitch };
      this.powerBias = clamp2(this.powerBias + (approachSpeed - speed) * 5e-3 * elapsed, 0, 1);
      f.throttle = this.phase === "go-around" ? 1 : clamp2(this.powerBias + (approachSpeed - speed) * 0.025, 0, 1);
      f.brake = false;
      f.trim = 0;
      this.telemetry = { h, agl, speed, vs, remaining: r.remaining, cross: r.crossTrack, crossRate, heading, course, targetHeading, targetBank: bank / rad3, pitch, approachSpeed, targetVs, desiredHeight };
    }
    if (!this.rollIntegral && this.inner.lateralBias) this.inner.lateralBias.z = 0;
    const commands = this.inner.cruiseCommands(f, dt);
    if (this.rollGain !== 4) commands.roll = rollServo(f, this.inner.attitudeTarget, this.rollGain);
    return commands;
  }
};

// tools/landing-session.mjs
function landingReadiness(f, end = "09") {
  if (!["09", "27"].includes(end)) return "\u7740\u9678\u65B9\u5411\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044";
  const problem = cruiseAuthority2(f) || cruisePropulsion2(f);
  if (problem) return problem;
  if (!f.parts.some((p) => PARTS3[p.type].wheel)) return "\u7740\u9678\u7528\u306E\u8ECA\u8F2A\u304C\u5FC5\u8981";
  const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
  if (referenceBody(center, f.universalTime).id !== "planet" || f.telemetry.contacts) return `\u6BCD\u661F\u306E\u6ED1\u8D70\u8DEF${end}\u3078\u98DB\u884C\u4E2D\u306B\u6E96\u5099\u3057\u3066\u304F\u3060\u3055\u3044`;
  const h = bodyAltitude5(center, f.universalTime), up = bodyUp3(center, f.universalTime), v = surfaceRelativeVelocity4(center, f.vel, f.universalTime);
  const r = runwayApproach5(center, f.universalTime, end, f.vel), heading = compassHeading4(new T6.Vector3(0, 0, 1).applyQuaternion(f.q), center, f.universalTime);
  if (!r || ![h, heading, r.remaining, r.crossTrack, v.length(), v.dot(up)].every(Number.isFinite) || h < 300 || h > 400 || r.remaining < 5e3 || r.remaining > 1e4 || Math.abs(r.crossTrack) > 250 || Math.abs((heading - (end === "27" ? 270 : 90) + 540) % 360 - 180) > 15) return `${end}\u7AEF\u306E\u624B\u524D5\u301C10 km\u30FB\u9AD8\u5EA6300\u301C400 m\u3067\u9032\u5165\u65B9\u5411\u3078\u6574\u5217\u3057\u3066\u304F\u3060\u3055\u3044`;
  if (v.length() < 40 || v.length() > 170 || Math.abs(v.dot(up)) > 6 || new T6.Vector3(0, 1, 0).applyQuaternion(f.q).dot(up) < 0.94) return "\u901F\u5EA6\u30FB\u59FF\u52E2\u30FB\u6607\u964D\u7387\u3092\u5B89\u5B9A\u3055\u305B\u3066\u304F\u3060\u3055\u3044";
  return null;
}
var LandingSession = class {
  constructor(client) {
    this.client = client;
    this.generation = 0;
    this.state = "idle";
    this.prepared = null;
    this.pilot = null;
    this.owner = null;
  }
  cancel() {
    this.generation++;
    this.client.cancel();
    this.prepared = null;
    if (!this.pilot) this.state = "idle";
  }
  async prepare(f, { end = "09" } = {}) {
    if (this.pilot) throw Error("\u7740\u9678\u5236\u5FA1\u3092\u505C\u6B62\u3057\u3066\u304B\u3089\u518D\u6E96\u5099\u3057\u3066\u304F\u3060\u3055\u3044");
    this.cancel();
    const generation = this.generation, problem = landingReadiness(f, end);
    if (problem) throw Error(problem);
    this.state = "planning";
    try {
      const result = await this.client.request(f);
      if (generation !== this.generation) return { status: "cancelled" };
      if (result.status !== "ready") {
        this.state = result.status === "unavailable" ? "rejected" : "idle";
        return result;
      }
      if (!result.context || !landingPlanMatches(result.plan, result.context) || !landingPlanCurrent(f, result.context) || landingReadiness(f, end)) {
        this.state = "idle";
        return { status: "stale" };
      }
      this.prepared = { f, ...result, end };
      this.state = "ready";
      return result;
    } catch (error) {
      if (generation !== this.generation) return { status: "cancelled" };
      this.state = "idle";
      throw error;
    }
  }
  readyFor(f) {
    if (this.state !== "ready" || !this.prepared) return false;
    const p = this.prepared, valid = p.f === f && landingPlanCurrent(f, p.context) && !landingReadiness(f, p.end);
    if (!valid) this.cancel();
    return valid;
  }
  start(f) {
    if (!this.readyFor(f)) throw Error("\u9032\u5165\u72B6\u614B\u304C\u5909\u308F\u308A\u307E\u3057\u305F\u3002\u7740\u9678\u3092\u518D\u6E96\u5099\u3057\u3066\u304F\u3060\u3055\u3044");
    const p = this.prepared;
    const pilot = new LandingPrototype(f, { end: p.end, preparedPlan: p.plan, preparedContext: p.context });
    this.previous = { sas: f.sas, sasMode: f.sasMode, trim: f.trim };
    this.owner = f;
    this.pilot = pilot;
    this.recovery = null;
    this.prepared = null;
    this.state = "running";
    this.reason = null;
    this.faultMessage = null;
    return pilot;
  }
  stop(reason = "manual") {
    this.cancel();
    const f = this.owner;
    if (f && this.pilot) {
      Object.assign(f, this.previous);
      f.holdQ = f.q.clone();
      if (reason === "fault" || reason === "landed") f.throttle = 0;
      if (reason === "landed") f.brake = true;
    }
    this.pilot = null;
    this.recovery = null;
    this.owner = null;
    this.state = reason === "fault" ? "failed" : reason === "landed" ? "landed" : "idle";
    this.reason = reason;
  }
  goAround(f) {
    if (f !== this.owner || !this.pilot || this.pilot.phase !== "approach") return false;
    this.pilot.phase = "go-around";
    this.pilot.reason = "requested";
    return true;
  }
  step(f, dt, { manual = false } = {}) {
    if (!this.pilot) return {};
    if (f !== this.owner || manual) {
      this.stop(manual ? "manual" : "vessel changed");
      return {};
    }
    if (f.crashed || !Number.isFinite(dt) || dt < 0) {
      this.stop("fault");
      return {};
    }
    if (dt === 0) return {};
    const problem = cruiseAuthority2(f) || (this.pilot.phase === "rollout" ? null : cruisePropulsion2(f));
    if (problem) {
      this.stop("fault");
      this.faultMessage = problem;
      return {};
    }
    if (this.pilot.phase === "go-around" && !this.recovery) {
      const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
      if (bodyAltitude5(center, f.universalTime) >= 450 && !cruiseReadiness2(f)) {
        const target = { speed: Math.max(90, this.pilot.trimPlan?.speed ?? 90), altitude: 600, heading: compassHeading4(new T6.Vector3(0, 0, 1).applyQuaternion(f.q), center, f.universalTime), mode: "altitude", vertical: 0 };
        if (!cruiseTargetReadiness3(f, target)) {
          this.recovery = new CruisePilot2(f, target);
          this.pilot.phase = "recovery";
        }
      }
    }
    if (this.recovery) {
      this.recovery.update(f, dt);
      this.telemetry = this.recovery.telemetry;
      if (!this.recovery.running) {
        this.faultMessage = this.recovery.faultMessage;
        this.stop("fault");
        return {};
      }
      this.pilot.phase = this.recovery.status === "\u4FDD\u6301" ? "recovery-hold" : "recovery";
      return {};
    }
    const commands = this.pilot.update(f, dt);
    this.telemetry = this.pilot.telemetry;
    if (this.pilot.phase === "failed") {
      this.faultMessage = this.pilot.reason;
      this.stop("fault");
      return {};
    }
    if (this.pilot.phase === "stopped") {
      this.stop("landed");
      return {};
    }
    return commands;
  }
};

// tools/return-pilot.mjs
import * as T7 from "three";
import { PRIMARY, bodyAltitude as bodyAltitude6 } from "./celestial.js";
import { fixedToInertial, inertialToFixed as inertialToFixed2, launchSiteOrientation, surfaceRelativeVelocity as surfaceRelativeVelocity5, surfaceOrientation as surfaceOrientation2 } from "./surface-frame.js";
import { compassHeading as compassHeading5 } from "./navigation.js";
import { runwayApproach as runwayApproach6, RUNWAY as RUNWAY4 } from "./runway-navigation.js";
import { CruisePilot as CruisePilot3, cruiseReadiness as cruiseReadiness3, cruiseTargetReadiness as cruiseTargetReadiness4 } from "./cruise-pilot.js";

// tools/return-route.mjs
var TAU = 2 * Math.PI;
var mod = (a) => (a % TAU + TAU) % TAU;
var left = (v) => ({ x: -v.y, y: v.x });
var add = (a, b, k = 1) => ({ x: a.x + k * b.x, y: a.y + k * b.y });
var dot = (a, b) => a.x * b.x + a.y * b.y;
var unit = (a) => ({ x: Math.cos(a), y: Math.sin(a) });
function circle(p, sign, radius) {
  return add(p, left(unit(p.heading)), sign * radius);
}
function arc(center, start, end, sign, radius, loops = 0) {
  const angle = Math.atan2(start.y - center.y, start.x - center.x);
  const sweep = mod(sign * (Math.atan2(end.y - center.y, end.x - center.x) - angle)) + loops * TAU;
  return { type: "arc", center, angle, sign, radius, sweep, length: sweep * radius };
}
function routePoint(route, distance) {
  if (!Number.isFinite(distance)) throw new RangeError("Non-finite route distance");
  let d = Math.max(0, Math.min(route.length, distance));
  for (let i = 0; i < route.segments.length; i++) {
    const s = route.segments[i];
    if (d > s.length && i < route.segments.length - 1) {
      d -= s.length;
      continue;
    }
    if (s.type === "line") return { ...add(s.start, unit(s.heading), d), heading: s.heading, curvature: 0 };
    const angle = s.angle + s.sign * d / s.radius;
    return { ...add(s.center, unit(angle), s.radius), heading: angle + s.sign * Math.PI / 2, curvature: s.sign / s.radius };
  }
  throw new Error("Empty route");
}
function planReturnRoute(start, goal, { radius, minLength = 0 } = {}) {
  if (![start?.x, start?.y, start?.heading, goal?.x, goal?.y, goal?.heading, radius, minLength].every(Number.isFinite) || radius <= 0 || minLength < 0)
    throw new RangeError("Finite poses, positive radius and nonnegative minimum length required");
  const candidates = [];
  for (const first of [-1, 1]) for (const last of [-1, 1]) {
    const c1 = circle(start, first, radius), c2 = circle(goal, last, radius), delta = add(c2, c1, -1);
    const distance = Math.hypot(delta.x, delta.y), k = first === last ? 1 : -1;
    if (distance < 1e-8) continue;
    const projection = radius * (1 - k) / distance;
    if (projection > 1) continue;
    const along = { x: delta.x / distance, y: delta.y / distance }, normal = left(along);
    for (const side of [-1, 1]) {
      const n = add({ x: projection * along.x, y: projection * along.y }, normal, side * Math.sqrt(Math.max(0, 1 - projection ** 2)));
      const tangent = left(n), direction = { x: first * tangent.x, y: first * tangent.y };
      const p1 = add(c1, n, radius), p2 = add(c2, n, k * radius), line = add(p2, p1, -1);
      if (dot(line, direction) < -1e-7) continue;
      const segments = [arc(c1, start, p1, first, radius), { type: "line", start: p1, heading: Math.atan2(direction.y, direction.x), length: Math.hypot(line.x, line.y) }, arc(c2, p2, goal, last, radius)];
      let length = segments.reduce((sum, s) => sum + s.length, 0);
      const loops = Math.max(0, Math.ceil((minLength - length) / (TAU * radius)));
      segments[0].sweep += loops * TAU;
      segments[0].length += loops * TAU * radius;
      length += loops * TAU * radius;
      candidates.push({ segments, length, radius, loops, family: `${first > 0 ? "L" : "R"}S${last > 0 ? "L" : "R"}` });
    }
  }
  if (!candidates.length) throw new RangeError("Degenerate circle geometry");
  return candidates.sort((a, b) => a.length - b.length)[0];
}

// tools/return-pilot.mjs
function returnReadiness(f, speed = 90, end = "09") {
  if (!["09", "27"].includes(end)) return "\u7740\u9678\u65B9\u5411\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044";
  const problem = cruiseReadiness3(f);
  if (problem) return problem;
  const h = bodyAltitude6(f.pos, f.universalTime), r = runwayApproach6(f.pos, f.universalTime);
  if (h > 1500 || !r || r.distance > 4e4) return "\u9AD8\u5EA6300\u301C1500 m\u30FB\u6ED1\u8D70\u8DEF\u304B\u308940 km\u4EE5\u5185\u3067\u5E30\u6295\u3057\u3066\u304F\u3060\u3055\u3044";
  return cruiseTargetReadiness4(f, { speed, altitude: 350, heading: end === "27" ? 270 : 90, mode: "altitude" });
}
var ReturnPilot = class {
  constructor(f, { speed = 90, end = "09" } = {}) {
    const problem = returnReadiness(f, speed, end);
    if (problem) throw Error(problem);
    this.end = end;
    this.heading = end === "27" ? 270 : 90;
    this.owner = f;
    this.previous = { sas: f.sas, sasMode: f.sasMode, trim: f.trim };
    this.phase = "return";
    this.running = true;
    this.orientation = launchSiteOrientation("runway");
    this.inverse = this.orientation.clone().invert();
    const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
    const local = inertialToFixed2(center, f.universalTime).applyQuaternion(this.inverse);
    const v = surfaceRelativeVelocity5(center, f.vel, f.universalTime).applyQuaternion(surfaceOrientation2(f.universalTime).invert()).applyQuaternion(this.inverse);
    const radius = Math.max(2500, Math.max(speed, v.length()) ** 2 / (9.81 * Math.tan(15 * Math.PI / 180)));
    const minLength = Math.max(18e3, (Math.max(0, bodyAltitude6(center, f.universalTime) - 350) / 5 + 30) * speed);
    this.route = planReturnRoute({ x: local.x, y: local.z, heading: Math.atan2(v.z, v.x) }, { x: 0, y: RUNWAY4.center + (end === "27" ? 1 : -1) * (RUNWAY4.length / 2 + 8850), heading: end === "27" ? -Math.PI / 2 : Math.PI / 2 }, { radius, minLength });
    this.progress = 0;
    this.maxRouteError = 0;
    this.elapsed = 0;
    this.driver = new TakeoffPrototype(f, { speed, altitude: 350, rotation: 12, integral: true, handoff: "attitude" });
    this.driver.cruise = new CruisePilot3(f, { speed, altitude: 350, heading: compassHeading5(new T7.Vector3(0, 0, 1).applyQuaternion(f.q), center, f.universalTime) });
  }
  stop(reason = "manual") {
    if (!this.running) return;
    this.running = false;
    this.reason = reason;
    this.phase = reason === "fault" ? "failed" : "stopped";
    Object.assign(this.owner, this.previous);
    this.owner.holdQ = this.owner.q.clone();
    if (reason === "fault") this.owner.throttle = 0;
  }
  recover(reason = "\u7740\u9678\u6E96\u5099\u3092\u4E2D\u6B62\u3057\u307E\u3057\u305F") {
    if (!this.running) return;
    const f = this.owner, center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
    this.phase = "recovery";
    this.recoveryReason = reason;
    this.driver.cruise.target.altitude = 600;
    this.driver.cruise.target.heading = compassHeading5(new T7.Vector3(0, 0, 1).applyQuaternion(f.q), center, f.universalTime);
  }
  drive(f, dt) {
    const commands = this.driver.update(f, dt);
    if (!this.driver.cruise.running) {
      this.faultMessage = this.driver.cruise.faultMessage;
      this.stop("fault");
      return {};
    }
    if (this.driver.attitudeTarget) {
      this.driver.lateralBias.z = 0;
      commands.roll = rollServo(f, this.driver.attitudeTarget, 12);
    }
    return commands;
  }
  update(f, dt, { manual = false } = {}) {
    if (!this.running) return {};
    if (f !== this.owner || manual) {
      this.stop(manual ? "manual" : "vessel changed");
      return {};
    }
    if (f.crashed || !Number.isFinite(dt) || dt < 0) {
      this.stop("fault");
      return {};
    }
    if (dt === 0) return {};
    if (this.phase === "recovery" || this.phase === "recovery-hold") {
      const commands2 = this.drive(f, dt);
      this.telemetry = this.driver.cruise.telemetry;
      if (this.running) this.phase = this.driver.cruise.status === "\u4FDD\u6301" ? "recovery-hold" : "recovery";
      return commands2;
    }
    this.elapsed += dt;
    const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
    const local = inertialToFixed2(center, f.universalTime).applyQuaternion(this.inverse), r = runwayApproach6(center, f.universalTime, this.end, f.vel);
    let nearest = this.progress, error = Infinity;
    for (let d = Math.max(0, this.progress - 100); d <= Math.min(this.route.length, this.progress + 1e3); d += 25) {
      const p = routePoint(this.route, d), e = Math.hypot(p.x - local.x, p.y - local.z);
      if (e < error) {
        error = e;
        nearest = d;
      }
    }
    this.progress = Math.max(this.progress, nearest);
    this.maxRouteError = Math.max(this.maxRouteError, error);
    const nearEnd = this.progress > this.route.length - 1200;
    if (!r || !Number.isFinite(error) || (nearEnd ? Math.abs(r.crossTrack) > 2e3 : error > 2e3) || this.elapsed > 1200 || f.telemetry.contacts) {
      this.faultMessage = "\u5E30\u6295\u7D4C\u8DEF\u3092\u7DAD\u6301\u3067\u304D\u307E\u305B\u3093";
      this.stop("fault");
      return {};
    }
    const aim = routePoint(this.route, Math.min(this.route.length, this.progress + 800));
    const target = fixedToInertial(new T7.Vector3(aim.x, PRIMARY.radius, aim.y).normalize().multiplyScalar(PRIMARY.radius + 350).applyQuaternion(this.orientation), f.universalTime);
    this.driver.cruise.target.heading = nearEnd ? this.heading - Math.atan2(r.crossTrack, 1500) * 180 / Math.PI : compassHeading5(target.sub(center), center, f.universalTime);
    this.phase = nearEnd && !landingReadiness(f, this.end) ? "capture" : "return";
    if (nearEnd && r.remaining < 5e3) {
      this.recover("\u7740\u9678\u6E96\u5099\u306E\u7BC4\u56F2\u3092\u901A\u904E\u3057\u307E\u3057\u305F");
      return this.drive(f, dt);
    }
    const commands = this.drive(f, dt);
    this.telemetry = { ...this.driver.cruise.telemetry, remaining: r.remaining, cross: r.crossTrack, progress: this.progress, length: this.route.length, error };
    return commands;
  }
};

// tools/return-session.mjs
var ReturnSession = class {
  constructor(client) {
    this.landing = new LandingSession(client);
    this.generation = 0;
    this.state = "idle";
    this.owner = null;
    this.pilot = null;
    this.pending = null;
  }
  start(f, settings) {
    if (this.owner) throw Error("\u73FE\u5728\u306E\u81EA\u52D5\u64CD\u7E26\u3092\u505C\u6B62\u3057\u3066\u304F\u3060\u3055\u3044");
    const pilot = new ReturnPilot(f, settings);
    this.generation++;
    this.owner = f;
    this.pilot = pilot;
    this.state = "return";
    this.message = null;
    return pilot;
  }
  stop(reason = "manual") {
    this.generation++;
    this.landing.stop(reason);
    this.pilot?.stop(reason);
    this.pilot = null;
    this.owner = null;
    this.pending = null;
    this.state = reason === "fault" ? "failed" : "idle";
  }
  recover(message) {
    this.generation++;
    this.landing.cancel();
    this.pending = null;
    this.message = message;
    this.pilot?.recover(message);
    this.state = "recovery";
  }
  prepare(f) {
    const generation = this.generation;
    this.state = "planning";
    this.pending = this.landing.prepare(f, { end: this.pilot.end }).then((result) => {
      if (generation !== this.generation || f !== this.owner) return;
      this.pending = null;
      if (result.status !== "ready") this.recover("\u7740\u9678\u8A08\u753B\u304C\u6210\u7ACB\u3057\u307E\u305B\u3093\u3067\u3057\u305F \xB7 \u9AD8\u5EA6600 m\u3078");
    }).catch((error) => {
      if (generation !== this.generation || f !== this.owner) return;
      this.recover(error.message + " \xB7 \u9AD8\u5EA6600 m\u3078");
    });
  }
  step(f, dt, { manual = false } = {}) {
    if (!this.owner) return {};
    if (f !== this.owner || manual) {
      this.stop(manual ? "manual" : "vessel changed");
      return {};
    }
    if (!Number.isFinite(dt) || dt < 0 || f.crashed) {
      this.stop("fault");
      return {};
    }
    if (dt === 0) return {};
    if (this.landing.pilot) {
      const commands2 = this.landing.step(f, dt);
      this.telemetry = this.landing.telemetry;
      this.state = this.landing.pilot?.phase ?? this.landing.state;
      if (!this.landing.pilot) {
        this.owner = null;
        this.pilot = null;
        this.generation++;
      }
      return commands2;
    }
    const pilot = this.pilot;
    if (this.landing.state === "ready") {
      if (!this.landing.readyFor(f)) {
        this.recover("\u7740\u9678\u8A08\u753B\u304C\u5931\u52B9\u3057\u307E\u3057\u305F \xB7 \u9AD8\u5EA6600 m\u3078");
      } else {
        pilot.stop("handoff");
        try {
          this.landing.start(f);
          this.state = "approach";
          return this.landing.step(f, dt);
        } catch (error) {
          this.message = error.message;
          this.stop("fault");
          return {};
        }
      }
    }
    const commands = pilot.update(f, dt);
    this.telemetry = pilot.telemetry;
    if (!pilot.running) {
      this.message = pilot.faultMessage;
      this.stop("fault");
      return {};
    }
    if (pilot.phase.startsWith("recovery")) {
      if (this.pending || this.landing.state !== "idle") this.recover(pilot.recoveryReason);
      this.state = pilot.phase;
      return commands;
    }
    if (pilot.phase === "capture" && !this.pending && this.landing.state === "idle") this.prepare(f);
    else if (!this.pending) this.state = pilot.phase;
    return commands;
  }
};
export {
  LandingPlanClient,
  LandingSession,
  ReturnSession,
  TakeoffPreviewClient,
  TakeoffSession,
  departureReadiness,
  landingReadiness,
  returnReadiness
};

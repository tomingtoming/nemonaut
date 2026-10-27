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
    const height = bodyAltitude(center, f.universalTime), speed = v.length(), vertical = v.dot(up), density = atmosphere(height).density;
    const minimum = Math.sqrt(2 * f.stats.mass * bodyGravity(center, f.universalTime).length() / (density * f.stats.aero.weight * 4.5 * 12 * rad));
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
      const lift = f.stats.mass * bodyGravity(center, f.universalTime).length() / (0.5 * density * speed * speed * f.stats.aero.weight * 4.5) / rad;
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
      if (result.status !== "airborne" || result.lastGround.along > RUNWAY2.length - TAKEOFF_END_MARGIN || Math.abs(result.lastGround.cross) > RUNWAY2.width / 2) {
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
export {
  TakeoffPreviewClient,
  TakeoffSession,
  departureReadiness
};

// tools/ascent-plane.mjs
import * as T from "three";
var north = new T.Vector3(1, 0, 0);
function ascentPlane(up, inclination) {
  if (!Number.isFinite(inclination) || inclination < 0 || inclination > 180) throw Error("Inclination outside 0\u2013180 degrees");
  const east = north.clone().cross(up), cosLatitude = east.length();
  const eastward = Math.cos(inclination * Math.PI / 180) / cosLatitude;
  if (!Number.isFinite(eastward) || Math.abs(eastward) > 1 + 1e-8) throw Error("Requested plane cannot pass through this launch latitude");
  east.normalize();
  const poleward = up.clone().cross(east), e = T.MathUtils.clamp(eastward, -1, 1);
  const tangent = east.multiplyScalar(e).addScaledVector(poleward, Math.sqrt(Math.max(0, 1 - e * e)));
  return up.clone().cross(tangent).normalize();
}
function orbitInclination(radial2, velocity) {
  const h = radial2.clone().cross(velocity);
  return h.lengthSq() > 1e-12 ? Math.acos(T.MathUtils.clamp(h.normalize().x, -1, 1)) * 180 / Math.PI : null;
}

// tools/ascent-prototype.mjs
import { engineMaxThrust } from "./resources.js";
import * as T2 from "three";
import { PARTS } from "./catalog.js";
import { localUp, orbitState, radial } from "./planet.js";
var Y = new T2.Vector3(0, 1, 0);
var AscentPrototype = class {
  constructor({ altitude = 9e4, tolerance = 2e3, inclination = 0 } = {}) {
    if (!Number.isFinite(altitude) || altitude < 8e4 || altitude > 5e5) throw Error("Target altitude outside 80\u2013500 km");
    if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 5e3) throw Error("Invalid orbit tolerance");
    if (!Number.isFinite(inclination) || inclination < 0 || inclination > 180) throw Error("Inclination outside 0\u2013180 degrees");
    this.inclination = inclination;
    this.plane = null;
    this.altitude = altitude;
    this.tolerance = tolerance;
    this.completionMessage = "\u76EE\u6A19\u8ECC\u9053\u306B\u5230\u9054\u3057\u307E\u3057\u305F";
    this.phase = "\u96E2\u6607";
    this.done = false;
    this.message = "\u81EA\u52D5\u6295\u5165\uFF1A\u96E2\u6607";
  }
  update(f) {
    f.navigationAuto = false;
    f.navigationFrame = "orbit";
    if (this.done || f.crashed) {
      f.throttle = 0;
      return;
    }
    if (!f.started) f.stageNext();
    const active = [...f.active].filter((id) => f.parts.some((p) => p.id === id));
    if (!active.length || active.every((id) => {
      const g = f.networks.network.get(id);
      return !g || g.tanks.every((p) => (f.fuel.get(p.id) || 0) < 1e-3);
    })) {
      f.throttle = 0;
      const next = f.parts.filter((p) => PARTS[p.type].thrust && p.stage > f.stage).map((p) => p.stage);
      if (!next.length) {
        this.done = true;
        this.phase = "\u71C3\u6599\u5207\u308C";
        this.completionMessage = "\u71C3\u6599\u5207\u308C \xB7 \u8ECC\u9053\u6295\u5165\u306F\u672A\u9054\u3067\u3059";
        this.message = this.completionMessage;
        return;
      }
      f.stageNext();
    }
    const com = f.stats.com.clone().applyQuaternion(f.q).add(f.pos), o = orbitState(com, f.vel), up = localUp(com);
    this.plane ??= ascentPlane(up, this.inclination);
    const tangent = this.plane.clone().cross(up).normalize(), r = radial(com);
    const thrust = f.parts.filter((p) => f.active.has(p.id)).reduce((s, p) => s + engineMaxThrust(p), 0), a = thrust / f.stats.mass;
    const lateral = o.altitude < 35e3 ? T2.MathUtils.clamp(-f.vel.dot(this.plane) / 60 - r.dot(this.plane) / 3600, -3, 3) * T2.MathUtils.clamp((o.altitude - 800) / 5e3, 0, 1) : T2.MathUtils.clamp(-f.vel.dot(this.plane) / 10 - r.dot(this.plane) / 400, -20, 20);
    let command;
    if (o.altitude < 35e3) {
      const angle = T2.MathUtils.clamp((o.altitude - 800) / 34200, 0, 1) * Math.PI / 3;
      command = up.clone().multiplyScalar(a * Math.cos(angle)).addScaledVector(tangent, a * Math.sin(angle)).addScaledVector(this.plane, lateral);
      f.throttle = 1;
      this.phase = "\u91CD\u529B\u30BF\u30FC\u30F3";
    } else {
      const vt = f.vel.dot(tangent), target = T2.MathUtils.clamp((this.altitude - o.altitude) / 50, -100, 500), ar = (target - o.vertical) / 12 + o.gravity - vt * vt / o.radius;
      const at = T2.MathUtils.clamp((o.circularSpeed - vt) / 20, -20, 30);
      command = up.clone().multiplyScalar(ar).addScaledVector(tangent, at).addScaledVector(this.plane, lateral);
      f.throttle = T2.MathUtils.clamp(command.length() / Math.max(a, 0.01), 0, 1);
      this.phase = "\u8ECC\u9053\u6295\u5165";
    }
    f.holdQ = new T2.Quaternion().setFromUnitVectors(Y, command.normalize());
    f.sas = true;
    f.sasMode = "hold";
    this.actualInclination = orbitInclination(r, f.vel);
    if (o.periapsis >= this.altitude - this.tolerance && o.apoapsis <= this.altitude + this.tolerance && o.energy < 0 && this.actualInclination !== null && Math.abs(this.actualInclination - this.inclination) <= 0.25) {
      f.throttle = 0;
      this.done = true;
      this.phase = "\u5468\u56DE\u9054\u6210";
    }
    this.message = "\u81EA\u52D5\u6295\u5165\uFF1A" + this.phase;
  }
};

// tools/ascent-session.mjs
import { PARTS as PARTS3 } from "./catalog.js";

// tools/ascent-readiness.mjs
import * as T3 from "three";
import { PARTS as PARTS2 } from "./catalog.js";
import { saveFlight, loadFlight } from "./flight-save.js";
import { bodyAltitude, bodyUp, bodyGravity, referenceBody } from "./celestial.js";
import { surfaceRelativeVelocity } from "./surface-frame.js";
import { atmosphere } from "./planet.js";
import { engineBurn } from "./resources.js";
import { partRotation } from "./aero.js";
function ascentReadiness(f) {
  if (!f || f.crashed || !f.rocketAxes || !f.parts.some((p) => PARTS2[p.type].control) || referenceBody(f.pos, f.universalTime).id !== "planet") return "\u6BCD\u661F\u306E\u5236\u5FA1\u53EF\u80FD\u306A\u30ED\u30B1\u30C3\u30C8\u304C\u5FC5\u8981";
  if (bodyAltitude(f.pos, f.universalTime) > 100 || surfaceRelativeVelocity(f.pos, f.vel, f.universalTime).length() > 2) return "\u5730\u4E0A\u3067\u9759\u6B62\u3057\u3066\u304B\u3089\u958B\u59CB\u3057\u3066\u304F\u3060\u3055\u3044";
  if (new T3.Vector3(0, 1, 0).applyQuaternion(f.q).dot(bodyUp(f.pos, f.universalTime)) < Math.cos(10 * Math.PI / 180)) return "\u6A5F\u4F53\u3092\u76F4\u7ACB\u3055\u305B\u3066\u304F\u3060\u3055\u3044";
  const data = saveFlight(f);
  data.detached = [];
  data.targetPartId = null;
  data.dockingPorts = null;
  let copy;
  try {
    copy = loadFlight(data);
    const last = Math.max(-1, ...copy.parts.filter((p) => PARTS2[p.type].thrust).map((p) => p.stage));
    while (!copy.active.size && copy.stage < last) copy.stageNext();
    if (!copy.parts.some((p) => PARTS2[p.type].control)) return "\u70B9\u706B\u307E\u3067\u306E\u6BB5\u5206\u96E2\u3067\u5236\u5FA1\u88C5\u7F6E\u3092\u5931\u3044\u307E\u3059";
    const engines = copy.parts.filter((p) => copy.active.has(p.id) && PARTS2[p.type].thrust);
    if (!engines.length || engines.some((p) => PARTS2[p.type].air || PARTS2[p.type].water)) return "\u30ED\u30B1\u30C3\u30C8\u30A8\u30F3\u30B8\u30F3\u306E\u70B9\u706B\u6BB5\u304C\u5FC5\u8981";
    const air = atmosphere(bodyAltitude(copy.pos, copy.universalTime));
    const thrust = engineBurn(copy.networks, copy.fuel, copy.active, 1, air.density, 0.01, air.pressure);
    let vertical = 0;
    const up = bodyUp(copy.pos, copy.universalTime);
    for (const p of engines) {
      const direction = new T3.Vector3(0, 1, 0).applyQuaternion(partRotation(p)).applyQuaternion(copy.q);
      vertical += (thrust.get(p.id) || 0) * direction.dot(up);
    }
    if (vertical <= 0) return "\u70B9\u706B\u6BB5\u3078\u71C3\u6599\u304C\u5C4A\u304B\u306A\u3044\u304B\u3001\u4E0A\u5411\u304D\u306E\u63A8\u529B\u304C\u3042\u308A\u307E\u305B\u3093";
    if (vertical <= copy.stats.mass * bodyGravity(copy.pos, copy.universalTime).length()) return "\u5730\u4E0A\u3067\u306E\u63A8\u529B\u304C\u91CD\u91CF\u3092\u4E0B\u56DE\u3063\u3066\u3044\u307E\u3059";
    const reaction = copy.reactionEnabled && copy.parts.some((p) => PARTS2[p.type].reactionTorque && p.reactionEnabled !== false) && [...copy.charge.values()].some((v) => v > 0);
    const gimbal = engines.some((p) => PARTS2[p.type].gimbal && p.gimbalEnabled !== false && (thrust.get(p.id) || 0) > 0);
    if (!reaction && !gimbal) return "\u4F5C\u52D5\u3067\u304D\u308B\u59FF\u52E2\u5236\u5FA1\u88C5\u7F6E\u304C\u5FC5\u8981";
    return null;
  } finally {
    copy?.dispose();
  }
}

// tools/ascent-session.mjs
import { bodyUp as bodyUp2 } from "./celestial.js";
var AscentSession = class {
  constructor() {
    this.owner = null;
    this.pilot = null;
    this.state = "idle";
    this.message = "";
  }
  start(f, settings) {
    if (this.owner) throw Error("Stop the current ascent first");
    const pilot = new AscentPrototype(settings);
    const reason = ascentReadiness(f);
    if (reason) throw Error(reason);
    pilot.plane = ascentPlane(bodyUp2(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), f.universalTime), pilot.inclination);
    this.previous = { sas: f.sas, sasMode: f.sasMode, navigationAuto: f.navigationAuto, navigationFrame: f.navigationFrame };
    this.owner = f;
    this.pilot = pilot;
    this.elapsed = 0;
    this.state = "running";
    this.message = "\u96E2\u6607";
  }
  stop(state = "cancelled", message = "\u4E2D\u6B62") {
    if (!this.owner) return;
    const f = this.owner;
    Object.assign(f, this.previous);
    f.holdQ = f.q.clone();
    f.throttle = 0;
    this.owner = null;
    this.pilot = null;
    this.state = state;
    this.message = message;
  }
  step(f, dt) {
    if (!this.owner) return;
    if (f !== this.owner) {
      this.stop("cancelled", "\u6A5F\u4F53\u5207\u66FF");
      return;
    }
    if (!Number.isFinite(dt) || dt < 0) {
      this.stop("failed", "\u7121\u52B9\u306A\u6642\u9593\u523B\u307F");
      return;
    }
    if (dt === 0) return;
    if (f.crashed || !f.parts.some((p) => PARTS3[p.type].control)) {
      this.stop("failed", "\u6A5F\u4F53\u306E\u5236\u5FA1\u3092\u5931\u3044\u307E\u3057\u305F");
      return;
    }
    this.elapsed += dt;
    if (this.elapsed > 1200) {
      this.stop("failed", "\u76EE\u6A19\u8ECC\u9053\u306B\u5230\u9054\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
      return;
    }
    this.pilot.update(f);
    this.message = this.pilot.message;
    if (this.pilot.done) this.stop(this.pilot.phase === "\u5468\u56DE\u9054\u6210" ? "complete" : "failed", this.pilot.completionMessage);
  }
};
export {
  AscentSession
};

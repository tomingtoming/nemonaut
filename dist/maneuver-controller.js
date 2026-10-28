// tools/maneuver-session.mjs
import * as T from "three";
import { transferBurnTiming } from "./timed-rendezvous.js";
import { canControl } from "./fleet.js";
import { PARTS } from "./catalog.js";
import { bodyOrbitState } from "./celestial.js";
import { terminalBurnDuration } from "./maneuver-thrust-profile.js";
import { captureBurnEstimate } from "./lunar-capture.js";
import { maneuverDirection, validateManeuverNode } from "./maneuver-node.js";

// tools/maneuver-execution-plan.mjs
import { transferThrottle } from "./rendezvous-burn.js";
import { terminalBurnThrottle } from "./maneuver-thrust-profile.js";
function maneuverExecutionPlan(node, now, fullDuration, { throttle, timing = "center" } = {}) {
  if (!node || node.complete) throw Error("\u672A\u5B9F\u884C\u306E\u30DE\u30CB\u30E5\u30FC\u30D0\u3092\u56FA\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
  if (!Number.isFinite(now) || !Number.isFinite(node.universalTime) || !Number.isFinite(fullDuration) || fullDuration <= 0) throw Error("\u5674\u5C04\u6642\u523B\u307E\u305F\u306F\u6240\u8981\u6642\u9593\u304C\u4E0D\u6B63\u3067\u3059");
  const fixed = !!(node.capture || node.returnPlan || node.departure || node.rendezvous || node.plannedThrottle !== void 0);
  const planned = node.rendezvous ? node.rendezvous.burnThrottle ?? 1 : node.plannedThrottle ?? 1, power = throttle ?? (fixed ? planned : 0.1);
  if (!Number.isFinite(power) || power <= 0 || power > 1 || !["start", "center"].includes(timing)) throw Error("\u5674\u5C04\u8A2D\u5B9A\u304C\u4E0D\u6B63\u3067\u3059");
  if (fixed && power !== planned) throw Error("\u56FA\u5B9A\u6E08\u307F\u306E\u8A08\u753B\u63A8\u529B\u3092\u5909\u66F4\u3067\u304D\u307E\u305B\u3093");
  const duration = fullDuration / power, startTime = node.universalTime - (!fixed && timing === "center" ? duration / 2 : 0);
  if (duration > 1200) throw Error("20\u5206\u3092\u8D85\u3048\u308B\u5674\u5C04\u306F\u672A\u5BFE\u5FDC\u3067\u3059");
  if (startTime <= now) throw Error("\u5674\u5C04\u958B\u59CB\u304C\u904E\u53BB\u306B\u306A\u308A\u307E\u3059\u3002\u8A08\u753B\u3092\u5148\u3078\u79FB\u3057\u3066\u304F\u3060\u3055\u3044");
  return { startTime, duration, throttle: power, timing: fixed ? "start" : timing };
}
function maneuverExecutionThrottle(node, plan, remaining) {
  return node.rendezvous ? node.rendezvous.burnThrottle ?? transferThrottle(remaining) : node.returnPlan || node.departure ? terminalBurnThrottle(remaining) : plan.throttle;
}

// tools/maneuver-session.mjs
var planKey = (n) => JSON.stringify([n.universalTime, n.time, n.impulse, n.plannedThrottle, n.tolerance, n.capture, n.returnPlan, n.departure, n.rendezvous]);
var craftKey = (f) => JSON.stringify([f.stage, [...f.active], f.parts.map((p) => [p.id, p.thrustLimit, p.fuelEnabled, p.fuelCrossfeed])]);
var ManeuverSession = class {
  constructor() {
    this.owner = null;
    this.state = "idle";
    this.message = "\u5F85\u6A5F";
  }
  start(f, settings = {}) {
    if (this.owner) throw Error("\u5B9F\u884C\u4E2D\u306E\u5674\u5C04\u3092\u505C\u6B62\u3057\u3066\u304F\u3060\u3055\u3044");
    if (!f || !canControl(f) || !f.rocketAxes) throw Error("\u5236\u5FA1\u53EF\u80FD\u306A\u30ED\u30B1\u30C3\u30C8\u304C\u5FC5\u8981\u3067\u3059");
    if (f.throttle !== 0) throw Error("\u30B9\u30ED\u30C3\u30C8\u30EB\u30920\u306B\u3057\u3066\u304F\u3060\u3055\u3044");
    const orbit = bodyOrbitState(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), f.vel, f.universalTime);
    if (orbit.altitude < Math.max(1e3, orbit.body.atmosphereTop ?? 0)) throw Error("\u5927\u6C17\u570F\u5916\u3067\u958B\u59CB\u3057\u3066\u304F\u3060\u3055\u3044");
    const n = validateManeuverNode(f.maneuver);
    if (!n || n.complete) throw Error("\u672A\u5B9F\u884C\u306E\u30DE\u30CB\u30E5\u30FC\u30D0\u3092\u56FA\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
    if (new T.Vector3(...n.remaining).distanceTo(new T.Vector3(...n.impulse)) > 1e-5) throw Error("\u5674\u5C04\u6E08\u307F\u306E\u8A08\u753B\u306F\u518D\u5B9F\u884C\u3067\u304D\u307E\u305B\u3093");
    if (n.rendezvous && (f.targetPartId !== n.rendezvous.targetPartId || !f.navigationTarget || f.navigationTarget.crashed)) throw Error("\u4F1A\u5408\u8A08\u753B\u306E\u76EE\u6A19\u304C\u5909\u66F4\u3055\u308C\u305F\u304B\u5931\u308F\u308C\u307E\u3057\u305F");
    const estimate = captureBurnEstimate(f, new T.Vector3(...n.remaining).length());
    if (!estimate.enough) throw Error("\u73FE\u5728\u306E\u70B9\u706B\u6BB5\u306E\u71C3\u6599\u304C\u4E0D\u8DB3\u3057\u3066\u3044\u307E\u3059");
    this.plan = maneuverExecutionPlan(n, f.universalTime, estimate.duration, settings);
    if (n.rendezvous) this.plan.duration = transferBurnTiming(f, new T.Vector3(...n.remaining).length(), { burnThrottle: n.rendezvous.burnThrottle }).duration;
    if (n.returnPlan || n.departure) {
      this.plan.duration = terminalBurnDuration(new T.Vector3(...n.remaining).length(), (dv) => captureBurnEstimate(f, dv).duration, n.tolerance ?? 0.5);
      if (this.plan.duration > 1200) throw Error("20\u5206\u3092\u8D85\u3048\u308B\u5674\u5C04\u306F\u672A\u5BFE\u5FDC\u3067\u3059");
    }
    this.previous = { sas: f.sas, sasMode: f.sasMode, navigationAuto: f.navigationAuto, navigationFrame: f.navigationFrame };
    this.node = f.maneuver;
    this.previousStop = this.node.stopAtTarget;
    this.signature = planKey(this.node);
    this.craft = craftKey(f);
    this.body = orbit.bodyId;
    this.owner = f;
    this.state = "aligning";
    this.message = "\u59FF\u52E2\u5408\u308F\u305B";
    this.stable = 0;
    this.offAxis = 0;
    this.lit = false;
  }
  stop(state = "cancelled", message = "\u4E2D\u6B62") {
    const f = this.owner;
    if (!f) return;
    f.throttle = 0;
    Object.assign(f, this.previous);
    f.holdQ = f.q.clone();
    if (!f.maneuver && f.sasMode === "maneuver") f.sasMode = "hold";
    if (this.previousStop === void 0) delete this.node.stopAtTarget;
    else this.node.stopAtTarget = this.previousStop;
    this.owner = null;
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
    if (!canControl(f)) {
      this.stop("failed", "\u6A5F\u4F53\u306E\u5236\u5FA1\u3092\u5931\u3044\u307E\u3057\u305F");
      return;
    }
    if (f.maneuver !== this.node || planKey(this.node) !== this.signature || craftKey(f) !== this.craft) {
      this.stop("cancelled", "\u6A5F\u4F53\u307E\u305F\u306F\u8A08\u753B\u304C\u5909\u66F4\u3055\u308C\u307E\u3057\u305F");
      return;
    }
    if (this.node.rendezvous && (f.targetPartId !== this.node.rendezvous.targetPartId || !f.navigationTarget || f.navigationTarget.crashed)) {
      this.stop("cancelled", "\u4F1A\u5408\u8A08\u753B\u306E\u76EE\u6A19\u304C\u5909\u66F4\u3055\u308C\u305F\u304B\u5931\u308F\u308C\u307E\u3057\u305F");
      return;
    }
    if (this.node.complete) {
      this.stop("complete", "\u4E88\u5B9A\u5674\u5C04\u3092\u5B8C\u4E86\u3057\u307E\u3057\u305F");
      return;
    }
    const orbit = bodyOrbitState(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), f.vel, f.universalTime);
    if (orbit.bodyId !== this.body || orbit.altitude < Math.max(1e3, orbit.body.atmosphereTop ?? 0)) {
      this.stop("failed", "\u5674\u5C04\u306E\u9069\u7528\u7BC4\u56F2\u3092\u5916\u308C\u307E\u3057\u305F");
      return;
    }
    if (f.universalTime > this.plan.startTime + this.plan.duration * 2 + 60) {
      this.stop("failed", "\u4E88\u5B9A\u5674\u5C04\u3092\u5B8C\u4E86\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
      return;
    }
    f.sas = true;
    f.sasMode = "maneuver";
    f.navigationAuto = false;
    f.navigationFrame = "orbit";
    this.node.stopAtTarget = true;
    const angle = new T.Vector3(0, 1, 0).applyQuaternion(f.q).angleTo(maneuverDirection(this.node));
    const aligned = angle < 2 * Math.PI / 180 && f.omega.length() < 0.03;
    this.stable = aligned ? this.stable + dt : 0;
    f.throttle = 0;
    if (f.universalTime < this.plan.startTime) {
      this.state = aligned ? "waiting" : "aligning";
      this.message = aligned ? "\u5674\u5C04\u5F85\u6A5F" : "\u59FF\u52E2\u5408\u308F\u305B";
      return;
    }
    if (!this.lit) {
      if (this.stable < 0.5) {
        if (f.universalTime > this.plan.startTime + 2) this.stop("failed", "\u958B\u59CB\u6642\u523B\u306B\u59FF\u52E2\u304C\u6574\u3044\u307E\u305B\u3093\u3067\u3057\u305F");
        return;
      }
      this.lit = true;
    }
    if (angle > 5 * Math.PI / 180) {
      this.offAxis += dt;
      this.message = "\u65B9\u5411\u305A\u308C\u3067\u5674\u5C04\u505C\u6B62";
      if (this.offAxis > 5) this.stop("failed", "\u5674\u5C04\u65B9\u5411\u3092\u7DAD\u6301\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
      return;
    }
    this.offAxis = 0;
    const engines = f.parts.filter((p) => f.active.has(p.id) && PARTS[p.type].thrust && !PARTS[p.type].air && !PARTS[p.type].water);
    if (!engines.some((p) => f.networks.network.get(p.id)?.tanks.some((t) => (f.fuel.get(t.id) || 0) > 0))) {
      this.stop("failed", "\u71C3\u6599\u5207\u308C \xB7 \u5674\u5C04\u672A\u9054");
      return;
    }
    this.state = "burning";
    this.message = "\u4E88\u5B9A\u5674\u5C04";
    f.throttle = maneuverExecutionThrottle(this.node, this.plan, new T.Vector3(...this.node.remaining).length());
  }
};
export {
  ManeuverSession
};

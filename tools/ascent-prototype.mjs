import {ascentPlane, orbitInclination} from './ascent-plane.mjs';
import {engineMaxThrust} from '../dist/resources.js';
import * as T from 'three';
import {PARTS} from '../dist/catalog.js';
import {localUp, orbitState, radial} from '../dist/planet.js';
const Y = new T.Vector3(0, 1, 0);
// Independent target-altitude experiment, not connected to the product UI.
// Commands only the existing actuators. Based on this repository's demonstration pilot.
// Optional demonstration pilot: commands the same throttle, staging and attitude actuators as the player.
export class AscentPrototype {
  constructor({altitude = 90000, tolerance = 2000, inclination = 0} = {}) {
    if (!Number.isFinite(altitude) || altitude < 80000 || altitude > 500000)
      throw Error('Target altitude outside 80–500 km');
    if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 5000)
      throw Error('Invalid orbit tolerance');
    if (!Number.isFinite(inclination) || inclination < 0 || inclination > 180)
      throw Error('Inclination outside 0–180 degrees');
    this.inclination = inclination;
    this.plane = null;
    this.altitude = altitude;
    this.tolerance = tolerance;
    this.completionMessage = '目標軌道に到達しました';
    this.phase = '離昇';
    this.done = false;
    this.message = '自動投入：離昇';
  }
  update(f) {
    f.navigationAuto = false;
    f.navigationFrame = 'orbit';
    if (this.done || f.crashed) {
      f.throttle = 0;
      return;
    }
    if (!f.started) f.stageNext();
    const active = [...f.active].filter(id => f.parts.some(p => p.id === id));
    if (
      !active.length ||
      active.every(id => {
        const g = f.networks.network.get(id);
        return !g || g.tanks.every(p => (f.fuel.get(p.id) || 0) < 0.001);
      })
    ) {
      f.throttle = 0;
      const next = f.parts.filter(p => PARTS[p.type].thrust && p.stage > f.stage).map(p => p.stage);
      if (!next.length) {
        this.done = true;
        this.phase = '燃料切れ';
        this.completionMessage = '燃料切れ · 軌道投入は未達です';
        this.message = this.completionMessage;
        return;
      }
      f.stageNext();
    }

    const com = f.stats.com.clone().applyQuaternion(f.q).add(f.pos),
      o = orbitState(com, f.vel),
      up = localUp(com);
    this.plane ??= ascentPlane(up, this.inclination);
    const tangent = this.plane.clone().cross(up).normalize(),
      r = radial(com);
    const thrust = f.parts.filter(p => f.active.has(p.id)).reduce((s, p) => s + engineMaxThrust(p), 0),
      a = thrust / f.stats.mass;
    const lateral =
      o.altitude < 35000
        ? T.MathUtils.clamp(-f.vel.dot(this.plane) / 60 - r.dot(this.plane) / 3600, -3, 3) *
          T.MathUtils.clamp((o.altitude - 800) / 5000, 0, 1)
        : T.MathUtils.clamp(-f.vel.dot(this.plane) / 10 - r.dot(this.plane) / 400, -20, 20);
    let command;
    if (o.altitude < 35000) {
      const angle = (T.MathUtils.clamp((o.altitude - 800) / 34200, 0, 1) * Math.PI) / 3;
      command = up
        .clone()
        .multiplyScalar(a * Math.cos(angle))
        .addScaledVector(tangent, a * Math.sin(angle))
        .addScaledVector(this.plane, lateral);
      f.throttle = 1;
      this.phase = '重力ターン';
    } else {
      const vt = f.vel.dot(tangent),
        target = T.MathUtils.clamp((this.altitude - o.altitude) / 50, -100, 500),
        ar = (target - o.vertical) / 12 + o.gravity - (vt * vt) / o.radius;
      const at = T.MathUtils.clamp((o.circularSpeed - vt) / 20, -20, 30);
      command = up
        .clone()
        .multiplyScalar(ar)
        .addScaledVector(tangent, at)
        .addScaledVector(this.plane, lateral);
      f.throttle = T.MathUtils.clamp(command.length() / Math.max(a, 0.01), 0, 1);
      this.phase = '軌道投入';
    }
    f.holdQ = new T.Quaternion().setFromUnitVectors(Y, command.normalize());
    f.sas = true;
    f.sasMode = 'hold';
    this.actualInclination = orbitInclination(r, f.vel);
    if (
      o.periapsis >= this.altitude - this.tolerance &&
      o.apoapsis <= this.altitude + this.tolerance &&
      o.energy < 0 &&
      this.actualInclination !== null &&
      Math.abs(this.actualInclination - this.inclination) <= 0.25
    ) {
      f.throttle = 0;
      this.done = true;
      this.phase = '周回達成';
    }

    this.message = '自動投入：' + this.phase;
  }
}

// Automatic ascent guidance to a circular orbit at a target altitude and inclination: gravity turn
// to 35 km, then a closed-loop insertion. Commands the same throttle, staging and attitude
// actuators as the player.
import {ascentPlane, orbitInclination} from './ascent-plane.js';
import {availableEngineForce} from './descent.js';
import * as T from 'three';
import {PARTS} from './catalog.js';
import {atmosphere, localUp, orbitState, radial} from './planet.js';
import type {Flight} from './core.js';
import {centerOfMass} from './center-of-mass.js';
import {separationDue} from './stage-fuel.js';
export interface AscentTarget {
  altitude?: number;
  tolerance?: number;
  inclination?: number;
}
export class AscentPrototype {
  declare inclination: number;
  declare plane: T.Vector3 | null;
  declare altitude: number;
  declare tolerance: number;
  declare completionMessage: string;
  declare phase: string;
  declare done: boolean;
  declare message: string;
  declare actualInclination: number | null | undefined;
  constructor({altitude = 90000, tolerance = 2000, inclination = 0}: AscentTarget = {}) {
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
  update(f: Flight): void {
    f.navigationAuto = false;
    f.navigationFrame = 'orbit';
    if (this.done || f.crashed) {
      f.throttle = 0;
      return;
    }
    const previousStage = f.stage;
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
    } else if (separationDue(f.parts, f.fuel, f.stage)) f.stageNext();

    const com = centerOfMass(f),
      o = orbitState(com, f.vel),
      up = localUp(com);
    this.plane ??= ascentPlane(up, this.inclination);
    const tangent = this.plane.clone().cross(up).normalize(),
      r = radial(com);
    const air = atmosphere(o.altitude),
      force = availableEngineForce(f, air.density, air.pressure),
      a = force.length() / f.stats.mass;
    if (!a) {
      f.throttle = 0;
      // An empty or dry stage can be followed by another ignition on the next update.
      if (f.stage === previousStage) {
        this.done = true;
        this.phase = '推力不足';
        this.completionMessage = '点火段の合計推力がゼロです';
        this.message = this.completionMessage;
      }
      return;
    }
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
    f.holdQ = new T.Quaternion().setFromUnitVectors(force.normalize(), command.normalize());
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

// Automatic burn of a fixed maneuver node: holds the burn attitude, waits for the planned start,
// throttles to the plan, and stops when the node completes or the vessel or plan changes.
import * as T from 'three';
import {transferBurnTiming} from './timed-rendezvous.js';
import {canControl} from './fleet.js';
import {PARTS} from './catalog.js';
import {attitudeTarget} from './navigation.js';
import {bodyOrbitState} from './celestial.js';
import {terminalBurnDuration} from './maneuver-thrust-profile.js';
import {captureBurnEstimate} from './lunar-capture.js';
import {maneuverDirection, validateManeuverNode, type ManeuverNodeRecord} from './maneuver-node.js';
import {
  maneuverExecutionPlan,
  maneuverExecutionThrottle,
  type ManeuverExecutionPlan,
  type ManeuverSettings
} from './maneuver-execution-plan.js';
import type {Flight} from './core.js';
export type {ManeuverExecutionPlan, ManeuverSettings} from './maneuver-execution-plan.js';
/** The pilot settings a burn takes over and gives back when it stops. */
export type ManeuverControlState = Pick<Flight, 'sas' | 'sasMode' | 'navigationAuto' | 'navigationFrame'>;

const planKey = (n: ManeuverNodeRecord): string =>
  JSON.stringify([
    n.universalTime,
    n.time,
    n.impulse,
    n.plannedThrottle,
    n.tolerance,
    n.capture,
    n.returnPlan,
    n.departure,
    n.rendezvous
  ]);
const craftKey = (f: Flight): string =>
  JSON.stringify([
    f.stage,
    [...f.active],
    f.parts.map(p => [p.id, p.thrustLimit, p.fuelEnabled, p.fuelCrossfeed])
  ]);
export class ManeuverSession {
  declare owner: Flight | null;
  declare state: string;
  declare message: string;
  // The fields below are assigned by start() and describe the burn only while owner is set.
  declare plan: ManeuverExecutionPlan | undefined;
  declare previous: ManeuverControlState | undefined;
  declare node: ManeuverNodeRecord | null | undefined;
  declare previousStop: boolean | undefined;
  declare signature: string | undefined;
  declare craft: string | undefined;
  declare body: string | undefined;
  declare stable: number;
  declare offAxis: number;
  declare lit: boolean | undefined;
  constructor() {
    this.owner = null;
    this.state = 'idle';
    this.message = '待機';
  }
  start(f: Flight | null | undefined, settings: ManeuverSettings = {}): void {
    if (this.owner) throw Error('実行中の噴射を停止してください');
    if (!f || !canControl(f)) throw Error('操縦可能な機体が必要です');
    if (f.throttle !== 0) throw Error('スロットルを0にしてください');
    const orbit = bodyOrbitState(
      f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
      f.vel,
      f.universalTime
    );
    if (orbit.altitude < Math.max(1000, orbit.body.atmosphereTop ?? 0))
      throw Error('大気圏外で開始してください');
    const n = validateManeuverNode(f.maneuver);
    if (!n || n.complete) throw Error('未実行のマニューバを固定してください');
    if (new T.Vector3(...n.remaining).distanceTo(new T.Vector3(...n.impulse)) > 1e-5)
      throw Error('噴射済みの計画は再実行できません');
    if (
      n.rendezvous &&
      (f.targetPartId !== n.rendezvous.targetPartId || !f.navigationTarget || f.navigationTarget.crashed)
    )
      throw Error('会合計画の目標が変更されたか失われました');
    const estimate = captureBurnEstimate(f, new T.Vector3(...n.remaining).length());
    if (!estimate.enough) throw Error('現在の点火段の燃料が不足しています');
    this.plan = maneuverExecutionPlan(n, f.universalTime, estimate.duration, settings);
    if (n.rendezvous)
      this.plan.duration = transferBurnTiming(f, new T.Vector3(...n.remaining).length(), {
        burnThrottle: n.rendezvous.burnThrottle
      }).duration;
    if (n.returnPlan || n.departure) {
      this.plan.duration = terminalBurnDuration(
        new T.Vector3(...n.remaining).length(),
        dv => captureBurnEstimate(f, dv).duration,
        n.tolerance ?? 0.5
      );
      if (this.plan.duration > 1200) throw Error('20分を超える噴射は未対応です');
    }
    this.previous = {
      sas: f.sas,
      sasMode: f.sasMode,
      navigationAuto: f.navigationAuto,
      navigationFrame: f.navigationFrame
    };
    this.node = f.maneuver;
    if (!this.node) throw TypeError('The validated maneuver is no longer on the vessel');
    this.previousStop = this.node.stopAtTarget;
    this.signature = planKey(this.node);
    this.craft = craftKey(f);
    this.body = orbit.bodyId;
    this.owner = f;
    this.state = 'aligning';
    this.message = '姿勢合わせ';
    this.stable = 0;
    this.offAxis = 0;
    this.lit = false;
  }
  stop(state = 'cancelled', message = '中止'): void {
    const f = this.owner;
    if (!f) return;
    f.throttle = 0;
    Object.assign(f, this.previous);
    f.holdQ = f.q.clone();
    if (!f.maneuver && f.sasMode === 'maneuver') f.sasMode = 'hold';
    if (!this.node) throw TypeError('No maneuver node to restore');
    if (this.previousStop === undefined) delete this.node.stopAtTarget;
    else this.node.stopAtTarget = this.previousStop;
    this.owner = null;
    this.state = state;
    this.message = message;
  }
  step(f: Flight, dt: number): void {
    if (!this.owner) return;
    if (f !== this.owner) {
      this.stop('cancelled', '機体切替');
      return;
    }
    if (!Number.isFinite(dt) || dt < 0) {
      this.stop('failed', '無効な時間刻み');
      return;
    }
    if (dt === 0) return;
    if (!canControl(f)) {
      this.stop('failed', '機体の制御を失いました');
      return;
    }
    if (
      f.maneuver !== this.node ||
      !this.node ||
      planKey(this.node) !== this.signature ||
      craftKey(f) !== this.craft
    ) {
      this.stop('cancelled', '機体または計画が変更されました');
      return;
    }
    if (
      this.node.rendezvous &&
      (f.targetPartId !== this.node.rendezvous.targetPartId ||
        !f.navigationTarget ||
        f.navigationTarget.crashed)
    ) {
      this.stop('cancelled', '会合計画の目標が変更されたか失われました');
      return;
    }
    if (this.node.complete) {
      this.stop('complete', '予定噴射を完了しました');
      return;
    }
    const orbit = bodyOrbitState(
      f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
      f.vel,
      f.universalTime
    );
    if (orbit.bodyId !== this.body || orbit.altitude < Math.max(1000, orbit.body.atmosphereTop ?? 0)) {
      this.stop('failed', '噴射の適用範囲を外れました');
      return;
    }
    if (!this.plan) throw TypeError('No execution plan');
    if (f.universalTime > this.plan.startTime + this.plan.duration * 2 + 60) {
      this.stop('failed', '予定噴射を完了できませんでした');
      return;
    }
    f.sas = true;
    // captureBurnEstimate validated the stage's thrust along assembly +Y.
    // The pilot may have chosen a different forward direction on the command part.
    const thrustAxis = new T.Vector3(0, 1, 0),
      direction = maneuverDirection(this.node);
    f.sasMode = 'hold';
    // Both are null only without a node, and the node was checked above.
    const hold = attitudeTarget(f.q, thrustAxis, direction);
    if (!direction || !hold) throw TypeError('A maneuver node always has a burn direction');
    f.holdQ = hold;
    f.navigationAuto = false;
    f.navigationFrame = 'orbit';
    this.node.stopAtTarget = true;
    const angle = thrustAxis.applyQuaternion(f.q).angleTo(direction);
    const aligned = angle < (2 * Math.PI) / 180 && f.omega.length() < 0.03;
    this.stable = aligned ? this.stable + dt : 0;
    f.throttle = 0;
    if (this.plan.onAlignment && !this.lit && this.stable >= 0.5 && f.universalTime < this.plan.startTime)
      this.plan.startTime = f.universalTime;
    if (f.universalTime < this.plan.startTime) {
      this.state = aligned ? 'waiting' : 'aligning';
      this.message = aligned ? '噴射待機' : '姿勢合わせ';
      return;
    }
    if (!this.lit) {
      if (this.stable < 0.5) {
        if (f.universalTime > this.plan.startTime + 2)
          this.stop('failed', '開始時刻に姿勢が整いませんでした');
        return;
      }
      this.lit = true;
    }
    if (angle > (5 * Math.PI) / 180) {
      this.offAxis += dt;
      this.message = '方向ずれで噴射停止';
      if (this.offAxis > 5) this.stop('failed', '噴射方向を維持できませんでした');
      return;
    }
    this.offAxis = 0;
    const engines = f.parts.filter(
      p =>
        f.active.has(p.id) &&
        PARTS[p.type].thrust &&
        PARTS[p.type].thrustMedium !== 'air' &&
        PARTS[p.type].thrustMedium !== 'water'
    );
    if (!engines.some(p => f.networks.network.get(p.id)?.tanks.some(t => (f.fuel.get(t.id) || 0) > 0))) {
      this.stop('failed', '燃料切れ · 噴射未達');
      return;
    }
    this.state = 'burning';
    this.message = '予定噴射';
    f.throttle = maneuverExecutionThrottle(
      this.node,
      this.plan,
      new T.Vector3(...this.node.remaining).length()
    );
  }
}

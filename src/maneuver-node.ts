import {validateRendezvousBurn} from './rendezvous-burn.js';
import {relativeMotion} from './celestial.js';
import * as T from 'three';
export interface ManeuverBurnWindow {
  midTime: number;
  duration: number;
  deltaV: number;
}
export interface ManeuverOrbitBurn extends ManeuverBurnWindow {
  periapsis: number;
}
export interface ManeuverReturnPlan extends ManeuverBurnWindow {
  predictedPeriapsis: number;
  exitTime: number;
  targetPeriapsis?: number;
}
export interface ManeuverNodeRecord {
  universalTime: number;
  time: number;
  position: T.Vector3Tuple;
  velocity: T.Vector3Tuple;
  impulse: T.Vector3Tuple;
  remaining: T.Vector3Tuple;
  complete: boolean;
  rendezvous?: import('./rendezvous-burn.js').RendezvousContractInput;
  tolerance?: number;
  plannedThrottle?: number;
  onAlignment?: boolean;
  stopAtTarget?: boolean;
  capture?: ManeuverOrbitBurn;
  returnPlan?: ManeuverReturnPlan;
  departure?: ManeuverOrbitBurn;
}
export interface ManeuverNodePreview {
  universalTime: number;
  time: number;
  deltaV: number;
  burnPos: T.Vector3;
  afterVel: T.Vector3;
  impulse: T.Vector3;
}
export interface ManeuverNodeOptions {
  plannedThrottle?: number;
  rendezvous?: import('./rendezvous-burn.js').RendezvousContractInput;
  onAlignment?: boolean;
}
export interface ManeuverEditValues {
  universalTime: number;
  prograde: number;
  normal: number;
  radial: number;
}
export function createManeuverNode(
  preview: ManeuverNodePreview,
  time: number,
  {plannedThrottle, rendezvous, onAlignment}: ManeuverNodeOptions = {}
): ManeuverNodeRecord {
  if (onAlignment && (rendezvous !== undefined || plannedThrottle !== undefined))
    throw Error('今すぐの計画には推力契約を付けられません');
  if (rendezvous !== undefined) {
    validateRendezvousBurn(rendezvous);
    if (plannedThrottle !== undefined) throw Error('噴射契約が重複しています');
  }
  if (plannedThrottle !== undefined && ![0.01, 0.1, 1].includes(plannedThrottle))
    throw Error('計画推力が不正です');
  if (Math.abs(preview.deltaV) < 0.5) throw Error('固定するΔvは0.5 m/s以上にしてください');
  return {
    universalTime: preview.universalTime,
    time: time + preview.time,
    position: preview.burnPos.toArray(),
    velocity: preview.afterVel.toArray(),
    impulse: preview.impulse.toArray(),
    remaining: preview.impulse.toArray(),
    complete: false,
    ...(rendezvous === undefined ? {} : {rendezvous: {...rendezvous}, tolerance: 0.05}),
    ...(plannedThrottle === undefined ? {} : {plannedThrottle}),
    ...(onAlignment ? {onAlignment: true} : {})
  };
}
export function maneuverDirection(node: ManeuverNodeRecord | null | undefined): T.Vector3 | null {
  return node ? new T.Vector3(...(node.complete ? node.impulse : node.remaining)).normalize() : null;
}
export function advanceManeuver(node: ManeuverNodeRecord | null | undefined, engineDeltaV: T.Vector3): void {
  if (!node) return;
  const before = new T.Vector3(...node.remaining),
    fraction = engineDeltaV.lengthSq()
      ? Math.max(0, Math.min(1, before.dot(engineDeltaV) / engineDeltaV.lengthSq()))
      : 0,
    closest = before.clone().addScaledVector(engineDeltaV, -fraction),
    remaining = before.sub(engineDeltaV);
  node.remaining = remaining.toArray();
  node.complete = node.complete || closest.length() < (node.tolerance ?? 0.5);
}
export function validateManeuverNode(
  value: ManeuverNodeRecord | null | undefined
): ManeuverNodeRecord | null {
  if (value == null) return null;
  if (value.rendezvous !== undefined) {
    if (!Number.isFinite(value.universalTime)) throw Error('会合噴射時刻が不正です');
    validateRendezvousBurn(value.rendezvous);
    if (
      value.plannedThrottle !== undefined ||
      value.capture !== undefined ||
      value.returnPlan !== undefined ||
      value.departure !== undefined ||
      value.tolerance !== 0.05
    )
      throw Error('会合噴射契約が不正です');
  }
  if (value.plannedThrottle !== undefined && ![0.01, 0.1, 1].includes(value.plannedThrottle))
    throw Error('計画推力の保存値が不正です');
  if (value.tolerance !== undefined && ![0.5, 0.05].includes(value.tolerance))
    throw Error('噴射精度の保存値が不正です');
  if (value.stopAtTarget !== undefined && typeof value.stopAtTarget !== 'boolean')
    throw Error('噴射停止支援の保存値が不正です');
  if (
    value.onAlignment !== undefined &&
    (value.onAlignment !== true ||
      value.rendezvous !== undefined ||
      value.plannedThrottle !== undefined ||
      value.capture !== undefined ||
      value.returnPlan !== undefined ||
      value.departure !== undefined)
  )
    throw Error('今すぐの噴射計画の保存値が不正です');
  if (
    value.universalTime !== undefined &&
    (!Number.isFinite(value.universalTime) || value.universalTime < 0 || value.universalTime > 1e12)
  )
    throw Error('マニューバ時刻が不正です');
  const validArray = (a: unknown, limit: number) =>
    Array.isArray(a) && a.length === 3 && a.every(v => Number.isFinite(v) && Math.abs(v) <= limit);
  if (
    !Number.isFinite(value.time) ||
    value.time < 0 ||
    value.time > 1e12 ||
    typeof value.complete !== 'boolean' ||
    !validArray(value.position, 1e10) ||
    !validArray(value.velocity, 1e6) ||
    !validArray(value.impulse, 10000) ||
    !validArray(value.remaining, 1e6) ||
    new T.Vector3(...value.impulse).length() < 0.5 ||
    new T.Vector3(...value.impulse).length() > 10000.001 ||
    (!value.complete && new T.Vector3(...value.remaining).length() < (value.tolerance ?? 0.5))
  )
    throw Error('マニューバ計画の保存値が不正です');
  if (value.capture !== undefined) {
    const c = value.capture;
    if (
      !c ||
      !Number.isFinite(value.universalTime) ||
      !(['midTime', 'duration', 'deltaV', 'periapsis'] as const).every(k => Number.isFinite(c[k])) ||
      c.duration <= 0 ||
      c.duration > 1200 ||
      c.deltaV < 0.5 ||
      c.deltaV > 10000 ||
      c.periapsis < 1000 ||
      c.periapsis > 2500000 ||
      Math.abs(c.midTime - value.universalTime - c.duration / 2) > 0.001 ||
      Math.abs(c.deltaV - new T.Vector3(...value.impulse).length()) > 0.001
    )
      throw Error('月周回計画の保存値が不正です');
  }
  if (value.returnPlan !== undefined) {
    const r = value.returnPlan;
    if (
      r?.targetPeriapsis !== undefined &&
      (!Number.isFinite(r.targetPeriapsis) || r.targetPeriapsis < 10000 || r.targetPeriapsis >= 70000)
    )
      throw Error('帰還目標近点の保存値が不正です');
    if (
      value.capture !== undefined ||
      !r ||
      !Number.isFinite(value.universalTime) ||
      !(['midTime', 'duration', 'deltaV', 'predictedPeriapsis', 'exitTime'] as const).every(k =>
        Number.isFinite(r[k])
      ) ||
      r.duration <= 0 ||
      r.duration > 1200 ||
      r.deltaV < 0.5 ||
      r.deltaV > 10000 ||
      r.predictedPeriapsis < 10000 ||
      r.predictedPeriapsis >= 70000 ||
      r.exitTime <= r.midTime ||
      r.exitTime - r.midTime > 604800 ||
      Math.abs(r.midTime - value.universalTime - r.duration / 2) > 0.001 ||
      Math.abs(r.deltaV - new T.Vector3(...value.impulse).length()) > 0.001
    )
      throw Error('母星帰還計画の保存値が不正です');
  }
  if (value.departure !== undefined) {
    const d = value.departure;
    if (
      value.capture !== undefined ||
      value.returnPlan !== undefined ||
      !d ||
      !Number.isFinite(value.universalTime) ||
      !(['midTime', 'duration', 'deltaV', 'periapsis'] as const).every(k => Number.isFinite(d[k])) ||
      d.duration <= 0 ||
      d.duration > 1200 ||
      d.deltaV < 0.5 ||
      d.deltaV > 1500 ||
      d.periapsis < 10000 ||
      d.periapsis > 1000000 ||
      Math.abs(d.midTime - value.universalTime - d.duration / 2) > 0.001 ||
      Math.abs(d.deltaV - new T.Vector3(...value.impulse).length()) > 0.001
    )
      throw Error('月遷移計画の保存値が不正です');
  }
  return structuredClone(value);
}

export function maneuverEditValues(
  node: ManeuverNodeRecord | null | undefined,
  now: number
): ManeuverEditValues {
  if (
    !node ||
    !Number.isFinite(node.universalTime) ||
    node.universalTime <= now ||
    node.complete ||
    node.capture ||
    node.returnPlan ||
    node.departure ||
    node.rendezvous
  )
    throw Error('未実行の通常マニューバだけ再編集できます');
  const impulse = new T.Vector3(...node.impulse);
  if (impulse.distanceTo(new T.Vector3(...node.remaining)) > 1e-5)
    throw Error('噴射を開始した計画は再編集できません');
  const pos = new T.Vector3(...node.position),
    vel = new T.Vector3(...node.velocity).sub(impulse),
    local = relativeMotion(pos, vel, node.universalTime),
    p = local.velocity.clone().normalize(),
    n = local.r.clone().cross(p).normalize(),
    r = p.clone().cross(n).normalize();
  if (n.lengthSq() < 0.5) throw Error('軌道面を決められません');
  return {
    universalTime: node.universalTime,
    prograde: impulse.dot(p),
    normal: impulse.dot(n),
    radial: impulse.dot(r)
  };
}

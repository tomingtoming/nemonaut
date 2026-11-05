import * as T from 'three';
import {PARTS} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {bodyAltitude, bodyUp, bodyGravity, referenceBody} from '../dist/celestial.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
import {atmosphere} from '../dist/planet.js';
import {engineBurn} from '../dist/resources.js';
import {partRotation} from '../dist/aero.js';

// Run on explicit start, not each display frame. The isolated snapshot exercises
// actual staging, including separators, without changing the player's vessel.
export function ascentReadiness(f) {
  if (
    !f ||
    f.crashed ||
    !f.rocketAxes ||
    !f.parts.some(p => PARTS[p.type].control) ||
    referenceBody(f.pos, f.universalTime).id !== 'planet'
  )
    return '母星の制御可能なロケットが必要';
  if (
    bodyAltitude(f.pos, f.universalTime) > 100 ||
    surfaceRelativeVelocity(f.pos, f.vel, f.universalTime).length() > 2
  )
    return '地上で静止してから開始してください';
  if (
    new T.Vector3(0, 1, 0).applyQuaternion(f.q).dot(bodyUp(f.pos, f.universalTime)) <
    Math.cos((10 * Math.PI) / 180)
  )
    return '機体を直立させてください';
  const data = saveFlight(f);
  data.detached = [];
  data.targetPartId = null;
  data.dockingPorts = null;
  let copy;
  try {
    copy = loadFlight(data);
    const last = Math.max(-1, ...copy.parts.filter(p => PARTS[p.type].thrust).map(p => p.stage));
    while (!copy.active.size && copy.stage < last) copy.stageNext();
    if (!copy.parts.some(p => PARTS[p.type].control)) return '点火までの段分離で制御装置を失います';
    const engines = copy.parts.filter(p => copy.active.has(p.id) && PARTS[p.type].thrust);
    if (
      !engines.length ||
      engines.some(p => PARTS[p.type].thrustMedium === 'air' || PARTS[p.type].thrustMedium === 'water')
    )
      return 'ロケットエンジンの点火段が必要';
    const air = atmosphere(bodyAltitude(copy.pos, copy.universalTime));
    const thrust = engineBurn(copy.networks, copy.fuel, copy.active, 1, air.density, 0.01, air.pressure);
    const force = new T.Vector3();
    const up = bodyUp(copy.pos, copy.universalTime);
    for (const p of engines) {
      const direction = new T.Vector3(0, 1, 0).applyQuaternion(partRotation(p));
      force.addScaledVector(direction, thrust.get(p.id) || 0);
    }
    const vertical = force.clone().applyQuaternion(copy.q).dot(up);
    if (vertical <= 0) return '点火段へ燃料が届かないか、上向きの推力がありません';
    if (vertical <= copy.stats.mass * bodyGravity(copy.pos, copy.universalTime).length())
      return '地上での推力が重量を下回っています';
    // The gravity turn aims assembly +Y; compare the combined force, so symmetric cant is allowed.
    if (force.angleTo(new T.Vector3(0, 1, 0)) > 0.01)
      return '主エンジンの推力軸を機体の上方向へ揃えてください';
    const reaction =
      copy.reactionEnabled &&
      copy.parts.some(p => PARTS[p.type].reactionTorque && p.reactionEnabled !== false) &&
      [...copy.charge.values()].some(v => v > 0);
    const gimbal = engines.some(
      p => PARTS[p.type].gimbal && p.gimbalEnabled !== false && (thrust.get(p.id) || 0) > 0
    );
    if (!reaction && !gimbal) return '作動できる姿勢制御装置が必要';
    return null;
  } finally {
    copy?.dispose();
  }
}

import {Quaternion, Vector3} from 'three';
import {partCenter, partRotation, type AeroPart} from './aero.js';
import {displacedVolume} from './buoyancy.js';
import {PARTS} from './catalog.js';
import {sharedPhysics} from './physics.js';

interface WaterFrame {
  pos: Vector3;
  q: Quaternion;
  com: Vector3;
  relativeVelocity: Vector3;
  relativeOmega: Vector3;
  waterAt(point: Vector3): boolean;
  altitude(point: Vector3): number;
  localUp(point: Vector3): Vector3;
  gravity(point: Vector3): Vector3;
  inverseEffectiveMass(point: Vector3, direction: Vector3): number;
}
interface WaterLoad {
  point: Vector3;
  buoyancy: Vector3;
  resistance: Vector3;
  planing: Vector3 | null;
}

export function waterLoads(parts: readonly AeroPart[], frame: WaterFrame, dt: number) {
  const result = new Map<AeroPart, WaterLoad[]>();
  const samples = [];
  let planingSamples = 0;
  for (const part of parts) {
    const d = PARTS[part.type],
      volume = displacedVolume(part);
    const orientation = frame.q.clone().multiply(partRotation(part)),
      inverse = orientation.clone().invert();
    const center = partCenter(part).applyQuaternion(frame.q).add(frame.pos);
    const normal = new Vector3(0, 0, -1).applyQuaternion(orientation);
    if (d.planingArea) planingSamples += 2;
    for (const side of [-0.32, 0.32]) {
      const point = new Vector3(0, side * d.size[1], 0).applyQuaternion(orientation).add(center);
      if (!frame.waterAt(point)) continue;
      const up = frame.localUp(point).applyQuaternion(inverse);
      const extent =
        (Math.abs(up.x) * d.size[0] + Math.abs(up.y) * d.size[1] + Math.abs(up.z) * d.size[2]) / 2;
      const height = frame.altitude(point);
      if (height >= Math.max(0.12, extent * 1.2) / 2) continue;
      const velocity = frame.relativeOmega
        .clone()
        .cross(point.clone().sub(frame.com))
        .add(frame.relativeVelocity)
        .applyQuaternion(inverse);
      const inverseMass = d.planingArea ? frame.inverseEffectiveMass(point, normal) : 0;
      samples.push({
        part,
        point,
        orientation,
        volume,
        height,
        extent,
        velocity,
        up,
        inverseMass,
        gravity: frame.gravity(point).length()
      });
    }
  }
  if (!samples.length) return result;
  const wasm = sharedPhysics();
  if (!wasm) throw Error('水力エンジンが未初期化です');
  const stride = 15,
    ptr = wasm.water_prepare(samples.length);
  const rows = new Float64Array(wasm.memory.buffer, ptr, stride * samples.length);
  for (const [i, s] of samples.entries()) {
    const offset = i * stride,
      d = PARTS[s.part.type];
    rows[offset] = s.height;
    rows[offset + 1] = s.extent;
    rows[offset + 2] = s.volume;
    rows[offset + 3] = s.gravity;
    s.velocity.toArray(rows, offset + 4);
    s.up.toArray(rows, offset + 7);
    rows.set(d.waterResistance ?? [1, 1, 1], offset + 10);
    rows[offset + 13] = d.planingArea ?? 0;
    rows[offset + 14] = s.inverseMass;
  }
  wasm.water_step(dt, planingSamples);
  for (const [i, s] of samples.entries()) {
    const j = i * stride;
    const loads = result.get(s.part) ?? [];
    loads.push({
      point: s.point,
      buoyancy: new Vector3().fromArray(rows, j + 1).applyQuaternion(s.orientation),
      resistance: new Vector3().fromArray(rows, j + 4).applyQuaternion(s.orientation),
      planing: rows[j + 7] > 0 ? new Vector3(0, 0, -rows[j + 7]).applyQuaternion(s.orientation) : null
    });
    result.set(s.part, loads);
  }
  return result;
}

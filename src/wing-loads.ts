import {Quaternion, Vector3} from 'three';
import {sharedPhysics} from './physics.js';

interface WingSample {
  orientation: Quaternion;
  velocity: Vector3;
  angle: number;
  medium: number;
  area: number;
}

/** Results use the input part order. Copy them before any subsequent shared-engine call can grow memory. */
export function wingLoads(samples: readonly WingSample[]): {force: Vector3; stalled: boolean}[] {
  if (!samples.length) return [];
  const wasm = sharedPhysics();
  if (!wasm) throw Error('翼の物理エンジンが未初期化です');
  const stride = 14;
  const ptr = wasm.wing_prepare(samples.length);
  const rows = new Float64Array(wasm.memory.buffer, ptr, samples.length * stride);
  const span = new Vector3(),
    normal = new Vector3(),
    forward = new Vector3(),
    hinge = new Quaternion();
  for (const [i, sample] of samples.entries()) {
    const j = i * stride;
    span.set(1, 0, 0);
    hinge.setFromAxisAngle(span, sample.angle);
    sample.velocity.toArray(rows, j);
    span.applyQuaternion(sample.orientation).toArray(rows, j + 3);
    normal
      .set(0, 0, 1)
      .applyQuaternion(hinge)
      .applyQuaternion(sample.orientation)
      .toArray(rows, j + 6);
    forward
      .set(0, 1, 0)
      .applyQuaternion(hinge)
      .applyQuaternion(sample.orientation)
      .toArray(rows, j + 9);
    rows[j + 12] = sample.medium;
    rows[j + 13] = sample.area;
  }
  wasm.wing_batch();
  return samples.map((_, i) => ({
    force: new Vector3().fromArray(rows, i * stride),
    stalled: rows[i * stride + 5] !== 0
  }));
}

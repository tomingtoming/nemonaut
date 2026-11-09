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

const stride = 15;

function waterPart(part: AeroPart) {
  const d = PARTS[part.type];
  const rotation = partRotation(part);
  const center = partCenter(part);
  return {
    definition: d,
    rotation,
    center,
    volume: displacedVolume(part),
    orientation: new Quaternion(),
    worldCenter: new Vector3(),
    samples: [-0.32, 0.32].map(side => ({
      localPoint: new Vector3(0, side * d.size[1], 0).applyQuaternion(rotation).add(center),
      point: new Vector3(),
      wet: false,
      buoyancy: new Vector3(),
      resistance: new Vector3(),
      planing: new Vector3()
    }))
  };
}

/** Owned by one flight until its collider geometry is rebuilt. Returned vectors are valid for the current step. */
export class WaterGeometry {
  private readonly parts;
  private readonly inputs;
  private readonly planingSamples;
  constructor(parts: readonly AeroPart[]) {
    this.parts = parts.map(waterPart);
    this.inputs = new Float64Array(this.parts.length * 2 * stride);
    this.planingSamples = this.parts.filter(p => p.definition.planingArea).length * 2;
    for (const [i, p] of this.parts.entries()) {
      for (let k = 0; k < 2; k++) {
        const j = (2 * i + k) * stride;
        this.inputs[j + 2] = p.volume;
        this.inputs.set(p.definition.waterResistance ?? [1, 1, 1], j + 10);
        this.inputs[j + 13] = p.definition.planingArea ?? 0;
      }
    }
  }

  update(frame: WaterFrame, dt: number) {
    const inputs = this.inputs;
    const inverse = new Quaternion(),
      normal = new Vector3(),
      lever = new Vector3(),
      velocity = new Vector3();
    let anyWet = false,
      offset = 0;
    for (const p of this.parts) {
      const q = p.orientation.copy(frame.q).multiply(p.rotation);
      p.worldCenter.copy(p.center).applyQuaternion(frame.q).add(frame.pos);
      inverse.copy(q).invert();
      normal.set(0, 0, -1).applyQuaternion(q);
      for (const sample of p.samples) {
        const j = offset;
        offset += stride;
        const point = sample.point.copy(sample.localPoint).applyQuaternion(frame.q).add(frame.pos);
        sample.wet = false;
        // A dry row must replace any wet input left over from the previous step.
        inputs[j] = 1;
        inputs[j + 1] = 0;
        if (!frame.waterAt(point)) continue;
        const up = frame.localUp(point).applyQuaternion(inverse),
          size = p.definition.size;
        const extent = (Math.abs(up.x) * size[0] + Math.abs(up.y) * size[1] + Math.abs(up.z) * size[2]) / 2;
        const height = frame.altitude(point);
        if (height >= Math.max(0.12, extent * 1.2) / 2) continue;
        anyWet = true;
        sample.wet = true;
        inputs[j] = height;
        inputs[j + 1] = extent;
        inputs[j + 3] = frame.gravity(point).length();
        lever.copy(point).sub(frame.com);
        velocity
          .crossVectors(frame.relativeOmega, lever)
          .add(frame.relativeVelocity)
          .applyQuaternion(inverse)
          .toArray(inputs, j + 4);
        up.toArray(inputs, j + 7);
        inputs[j + 14] = p.definition.planingArea ? frame.inverseEffectiveMass(point, normal) : 0;
      }
    }
    if (!anyWet) return this.parts;
    const wasm = sharedPhysics();
    if (!wasm) throw Error('水力エンジンが未初期化です');
    const ptr = wasm.water_prepare(this.parts.length * 2);
    const rows = new Float64Array(wasm.memory.buffer, ptr, inputs.length);
    rows.set(inputs);
    wasm.water_step(dt, this.planingSamples);
    offset = 0;
    for (const p of this.parts) {
      for (const sample of p.samples) {
        const j = offset;
        offset += stride;
        if (!sample.wet) continue;
        sample.buoyancy.fromArray(rows, j + 1).applyQuaternion(p.orientation);
        sample.resistance.fromArray(rows, j + 4).applyQuaternion(p.orientation);
        sample.planing.set(0, 0, -rows[j + 7]).applyQuaternion(p.orientation);
      }
    }
    return this.parts;
  }
}

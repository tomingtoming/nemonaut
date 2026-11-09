import {cargoShellBoxes, hasCargoBay, type CargoBox} from './cargo-geometry.js';
import * as T from 'three';
import {PARTS} from './catalog.js';
import {partRotation, type AeroPart} from './aero.js';
import {gearRetracted} from './landing-gear.js';
import physics, {sharedPhysics} from './physics.js';
await physics.init();
// D = 1/2 rho v² Cd A. Bounding-box face quadrature approximates exposed
// projected area; this is a game model, not measured Cd or compressible CFD.
// Wings already have their own lift/drag and are excluded here.
export const MIN_BODY_DRAG_FORCE = 1e-4; // Newtons; upper bound, not a speed cutoff.
export interface BodyDragPart extends AeroPart {
  id: string;
  cargoOpen?: boolean;
}
export interface BodyDragBox {
  id: string;
  type: string;
  center: T.Vector3;
  half: T.Vector3;
  rotation: T.Quaternion;
  axes: T.Vector3[];
}
export interface BodyAerodynamics {
  dispose(): void;
  maxCdArea: number;
  dragArea(direction: T.Vector3): number;
}
export interface BodyDragResult {
  force: T.Vector3;
  cdArea: number;
}
export function bodyDragBoxes(parts: BodyDragPart[], gearDeployed = true): BodyDragBox[] {
  return parts
    .filter(p => !PARTS[p.type].wing && !gearRetracted(p, gearDeployed))
    .flatMap((p): BodyDragBox[] => {
      const d = PARTS[p.type],
        rotation = partRotation(p),
        pieces: CargoBox[] = hasCargoBay(d)
          ? cargoShellBoxes(d, p.cargoOpen)
          : [{center: [0, 0, 0], size: d.size}];
      return pieces.map(piece => {
        const q = rotation
          .clone()
          .multiply(new T.Quaternion().setFromEuler(new T.Euler(...(piece.rotation || [0, 0, 0]))));
        return {
          id: p.id,
          type: p.type,
          center: new T.Vector3(...piece.center).applyQuaternion(rotation).add(new T.Vector3(...p.p)),
          half: new T.Vector3(...piece.size).multiplyScalar(0.5),
          rotation: q,
          axes: [new T.Vector3(1, 0, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1)].map(a =>
            a.applyQuaternion(q)
          )
        };
      });
    });
}
const abandoned = new FinalizationRegistry<{wasm: NonNullable<ReturnType<typeof sharedPhysics>>; id: number}>(
  ({wasm, id}) => wasm.drag_release(id)
);

export function createBodyAerodynamics(parts: BodyDragPart[], gearDeployed = true): BodyAerodynamics {
  const boxes = bodyDragBoxes(parts, gearDeployed);

  const maxCdArea = boxes.reduce(
    (sum, b) =>
      sum +
      4 *
        (b.half.x * b.half.y + b.half.y * b.half.z + b.half.z * b.half.x) *
        (PARTS[b.type].bodyDragShape === 'disc-y' ? 1.1 : 0.4),
    0
  );
  const wasm = sharedPhysics();
  if (!wasm) throw Error('胴体抵抗の物理エンジンが未初期化です');
  const id = wasm.drag_create(boxes.length);
  try {
    const stride = 17;
    const rows = new Float64Array(wasm.memory.buffer, wasm.drag_rows(id), boxes.length * stride);
    boxes.forEach((box, i) => {
      const j = i * stride,
        d = PARTS[box.type];
      box.center.toArray(rows, j);
      box.half.toArray(rows, j + 3);
      box.axes.forEach((axis, k) => axis.toArray(rows, j + 6 + 3 * k));
      rows[j + 15] = Number(d.bodyDragShape === 'disc-y');
      rows[j + 16] = Number(!!d.streamlinedNose);
    });
    const model: BodyAerodynamics = {
      maxCdArea,
      dragArea(direction) {
        return wasm.drag_area(id, direction.x, direction.y, direction.z);
      },
      dispose() {
        if (abandoned.unregister(model)) wasm.drag_release(id);
      }
    };
    abandoned.register(model, {wasm, id}, model);
    return model;
  } catch (error) {
    wasm.drag_release(id);
    throw error;
  }
}
export function bodyDrag(
  model: BodyAerodynamics,
  orientation: T.Quaternion,
  velocity: T.Vector3,
  density: number
): BodyDragResult {
  const speed = velocity.length();
  if (speed < 1e-8 || density <= 0) return {force: new T.Vector3(), cdArea: 0};
  // Near rest the wind direction is numerical noise, invalidating the directional
  // cache every step. Skip quadrature only when even fully exposed drag is tiny.
  if (0.5 * density * speed * speed * model.maxCdArea < MIN_BODY_DRAG_FORCE)
    return {force: new T.Vector3(), cdArea: 0};
  const local = velocity.clone().applyQuaternion(orientation.clone().invert()),
    cdArea = model.dragArea(local);
  return {force: velocity.clone().multiplyScalar(-0.5 * density * speed * cdArea), cdArea};
}

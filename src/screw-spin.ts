// Screw spin (BACKLOG 9b): how fast a screw's rotor turns on screen, and which part of the model turns. No
// DOM or scene; part-visuals.ts turns the rotor in flight. The rate follows the thrust the screw actually
// gives (throttle × submersion × active), so a screw out of the water or at zero throttle stands still, and
// a screw at full thrust turns visibly without strobing at 60 frames per second.
import * as T from 'three';
/** Blade tip speed (m/s) of a screw at full thrust; larger screws turn more slowly, as real ones do. */
export const SCREW_TIP_SPEED = 12;
/** Time constant (s) of the rotor speeding up and running down. */
export const SCREW_SPIN_LAG = 0.4;
/** Rotor speed (rad/s) for `thrust` (N) out of `maxThrust` (N) on a screw of blade `radius` (m). */
export function screwSpinTarget(thrust: number, maxThrust: number, radius: number): number {
  if (!(maxThrust > 0) || !(radius > 0)) return 0;
  return (Math.min(1, Math.max(0, thrust / maxThrust)) * SCREW_TIP_SPEED) / radius;
}
/** Rotor speed after `dt` seconds of following `target` with the lag of the rotor's inertia. */
export function screwSpinStep(speed: number, target: number, dt: number): number {
  if (!(dt > 0)) return speed;
  return target + (speed - target) * Math.exp(-dt / SCREW_SPIN_LAG);
}
/**
 * The turning part of a screw model (BACKLOG 9b). The generated screw models (assets-source/generate_parts.py,
 * scaled for the large screw) merge housing, shaft, spinner and blades into one mesh with one primitive per
 * material, so there is no rotor node. The blades are the widest sub-mesh centred on the shaft (the model's
 * Y axis, along the thrust); they are moved into a new group that turns about that axis. Null when the model
 * has no such sub-mesh: the screw then stays still.
 */
export function screwRotor(model: T.Object3D): T.Group | null {
  const centred: {mesh: T.Mesh; radius: number}[] = [];
  model.traverse(m => {
    if (!(m instanceof T.Mesh)) return;
    m.geometry.computeBoundingBox();
    const box = m.geometry.boundingBox;
    if (!box) return;
    const radius = Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z);
    if (Math.abs(box.max.x + box.min.x) < radius * 0.1 && Math.abs(box.max.z + box.min.z) < radius * 0.1)
      centred.push({mesh: m, radius});
  });
  const mesh = centred.reduce<{mesh: T.Mesh; radius: number} | null>(
      (best, c) => (!best || c.radius > best.radius ? c : best),
      null
    )?.mesh,
    parent = mesh?.parent;
  if (!mesh || !parent) return null;
  const rotor = new T.Group();
  rotor.name = 'ScrewRotor';
  rotor.position.copy(mesh.position);
  rotor.quaternion.copy(mesh.quaternion);
  parent.add(rotor);
  mesh.position.set(0, 0, 0);
  mesh.quaternion.identity();
  rotor.add(mesh);
  return rotor;
}

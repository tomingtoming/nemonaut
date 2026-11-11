// Screw spin: how fast a screw's rotor turns on screen, and which part of the model turns. No
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
/** The exported blade primitive rotates continuously around the shaft's local Y axis. */
export function screwRotor(
  model: T.Object3D,
  bladeMaterial: string,
  pivot: readonly number[]
): T.Group | null {
  const meshes: T.Mesh[] = [];
  model.traverse(node => {
    if (node instanceof T.Mesh && node.material.name === bladeMaterial) meshes.push(node);
  });
  const mesh = meshes[0];
  if (meshes.length !== 1 || !mesh?.parent) return null;
  const rotor = new T.Group();
  rotor.name = 'ScrewRotor';
  rotor.position.fromArray(pivot);
  mesh.parent.add(rotor);
  mesh.position.sub(rotor.position);
  rotor.add(mesh);
  return rotor;
}

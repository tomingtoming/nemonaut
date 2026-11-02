import {Vector3, Quaternion} from 'three';
const worldUp = new Vector3(0, 1, 0);
type OrbitControls = import('three/addons/controls/OrbitControls.js').OrbitControls;
// three r180 OrbitControls keeps these private frame caches; @types/three does not declare them.
export type OrbitControlsFrame = OrbitControls & {_quat: Quaternion; _quatInverse: Quaternion};
const hasFrame = (controls: OrbitControls): controls is OrbitControlsFrame =>
  '_quat' in controls &&
  controls._quat instanceof Quaternion &&
  '_quatInverse' in controls &&
  controls._quatInverse instanceof Quaternion;

// A low marine view follows shallow dives below the opaque sea surface.
// This only chooses the initial/F-key offset; orbit input remains unrestricted.
export function flightFrameOffset(distance: number, up: Vector3, water = false): Vector3 {
  return new Vector3(1, water ? 0.06 : 0.65, 1.3)
    .normalize()
    .multiplyScalar(distance)
    .applyQuaternion(new Quaternion().setFromUnitVectors(worldUp, up));
}

// Three r180 caches this frame at construction. Keep it synchronized with the
// local vertical so orbit/pan input and camera.lookAt use the same up direction.
export function setOrbitUp(controls: OrbitControls, up: Vector3): void {
  controls.object.up.copy(up);
  if (!hasFrame(controls)) throw Error('OrbitControls の内部フレーム(_quat/_quatInverse)が見つかりません');
  controls._quat.setFromUnitVectors(controls.object.up, worldUp);
  controls._quatInverse.copy(controls._quat).invert();
}

export function frameTrackedVessel(controls: OrbitControls, focus: Vector3, up: Vector3): void {
  setOrbitUp(controls, up);
  controls.target.copy(focus);
  const offset = new Vector3(14, 10, 18).applyQuaternion(new Quaternion().setFromUnitVectors(worldUp, up));
  controls.object.position.copy(focus).add(offset);
  controls.update();
}

// Apply after OrbitControls, including its damping. Do not move the focus or
// the vessel. Water mode deliberately permits the camera below sea level.
export function constrainSurfaceCamera(controls: OrbitControls, center: Vector3, radius: number): boolean {
  const camera = controls.object,
    radial = camera.position.clone().sub(center);
  if (!('near' in camera) || typeof camera.near !== 'number')
    throw Error('カメラの近クリップ面(near)が見つかりません');
  const minimum = radius + Math.max(0.5, camera.near * 2);
  if (radial.lengthSq() >= minimum * minimum) return false;
  if (radial.lengthSq() < 1e-12) radial.copy(camera.up);
  camera.position.copy(center).add(radial.setLength(minimum));
  camera.lookAt(controls.target);
  return true;
}

// Arrow-key orbit: Left/Right turn around the local vertical (camera.up); Up raises the camera
// to look down more, Down lowers it.
// Keeps the distance and stays inside the controls' polar range, short of the poles.
export const ARROW_ORBIT = {azimuthRate: Math.PI / 2, polarRate: Math.PI / 3};
export function orbitByArrows(
  controls: OrbitControls,
  held: {has(code: string): boolean},
  dt: number
): boolean {
  const turn = (held.has('ArrowLeft') ? 1 : 0) - (held.has('ArrowRight') ? 1 : 0),
    tilt = (held.has('ArrowUp') ? 1 : 0) - (held.has('ArrowDown') ? 1 : 0);
  if ((!turn && !tilt) || !(dt > 0)) return false;
  const up = controls.object.up.clone().normalize(),
    offset = controls.object.position.clone().sub(controls.target),
    distance = offset.length();
  if (!(distance > 0)) return false;
  offset.applyAxisAngle(up, turn * ARROW_ORBIT.azimuthRate * dt);
  const polar = Math.acos(Math.min(1, Math.max(-1, offset.dot(up) / distance))),
    margin = 1e-3;
  const min = Math.max(controls.minPolarAngle ?? 0, margin),
    max = Math.min(controls.maxPolarAngle ?? Math.PI, Math.PI - margin);
  const next = Math.min(max, Math.max(min, polar - tilt * ARROW_ORBIT.polarRate * dt)),
    axis = new Vector3().crossVectors(up, offset);
  if (axis.lengthSq() > 1e-12 && next !== polar) offset.applyAxisAngle(axis.normalize(), next - polar);
  controls.object.position.copy(controls.target).add(offset);
  return true;
}

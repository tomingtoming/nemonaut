import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera, Vector3, Quaternion} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {
  setOrbitUp,
  frameTrackedVessel,
  constrainSurfaceCamera,
  flightFrameOffset
} from '../dist/camera-up.js';

test('OrbitControls uses the local vertical through body rotation and workshop return', () => {
  const camera = new PerspectiveCamera(),
    controls = new OrbitControls(camera, null);
  controls.target.set(120, 340, -210);
  const localOffset = new Vector3(12, 8, 16),
    worldUp = new Vector3(0, 1, 0);
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5, 0]) {
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angle);
    const up = worldUp.clone().applyQuaternion(rotation);
    const offset = localOffset.clone().applyQuaternion(rotation);
    camera.position.copy(controls.target).add(offset);
    setOrbitUp(controls, up);
    controls.update();
    camera.updateMatrixWorld();
    assert.ok(camera.position.distanceTo(controls.target.clone().add(offset)) < 1e-8);
    assert.ok(Math.abs(controls.getPolarAngle() - Math.acos(localOffset.y / localOffset.length())) < 1e-10);
    const screenUp = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const forward = controls.target.clone().sub(camera.position).normalize();
    const expectedUp = up.clone().addScaledVector(forward, -up.dot(forward)).normalize();
    assert.ok(screenUp.dot(expectedUp) > 1 - 1e-10, 'local horizon has no camera roll');
  }
});

test('tracking begins above the local surface at every latitude and longitude', () => {
  const camera = new PerspectiveCamera(40, 1, 0.05, 5e7),
    controls = new OrbitControls(camera, null);
  const center = new Vector3(0, -600000, 0),
    radius = 600000;
  for (const up of [
    new Vector3(0, 1, 0),
    new Vector3(0, -1, 0),
    new Vector3(1, 0, 0),
    new Vector3(0, 0, -1),
    new Vector3(1, -2, 3).normalize()
  ]) {
    const focus = center.clone().addScaledVector(up, radius + 2);
    frameTrackedVessel(controls, focus, up);
    assert.ok(camera.position.distanceTo(center) > radius + 11.99);
    assert.ok(Math.abs(camera.position.clone().sub(focus).dot(up) - 10) < 1e-7);
    assert.ok(controls.target.distanceTo(focus) < 1e-9);
  }
});

test('surface constraint keeps camera outside mother planet and moving moon without moving focus', () => {
  for (const [center, radius] of [
    [new Vector3(0, -600000, 0), 600000],
    [new Vector3(7100000, -3000000, 9000000), 200000]
  ]) {
    const camera = new PerspectiveCamera(40, 1, 0.05, 5e7),
      controls = new OrbitControls(camera, null);
    const up = new Vector3(1, -2, 3).normalize();
    controls.target.copy(center).addScaledVector(up, radius + 1);
    const focus = controls.target.clone();
    camera.position.copy(center).addScaledVector(up, radius - 15);
    assert.equal(constrainSurfaceCamera(controls, center, radius), true);
    assert.ok(Math.abs(camera.position.distanceTo(center) - (radius + 0.5)) < 1e-7);
    assert.deepEqual(controls.target, focus);
    const direction = new Vector3();
    camera.getWorldDirection(direction);
    assert.ok(direction.dot(focus.clone().sub(camera.position).normalize()) > 1 - 1e-9);
    camera.position.copy(center).addScaledVector(up, radius + 80000);
    const before = camera.position.clone();
    assert.equal(constrainSurfaceCamera(controls, center, radius), false);
    assert.deepEqual(camera.position, before);
  }
});

test('marine framing follows shallow dives while land framing retains the overhead view', () => {
  const center = new Vector3(0, -600000, 0),
    radius = 600000;
  for (const up of [new Vector3(0, 1, 0), new Vector3(0, -1, 0), new Vector3(1, 2, 3).normalize()])
    for (const distance of [20, 60, 100]) {
      const sea = flightFrameOffset(distance, up, true),
        land = flightFrameOffset(distance, up, false);
      assert.ok(Math.abs(sea.length() - distance) < 1e-8);
      assert.ok(sea.dot(up) > 0 && sea.dot(up) < 4);
      const focus = center.clone().addScaledVector(up, radius - 8.9);
      assert.ok(
        focus.clone().add(sea).distanceTo(center) < radius - 5,
        'camera enters water with the shallow-diving vessel'
      );
      assert.ok(land.dot(up) > distance * 0.3, 'ordinary flight retains its overhead view');
    }
});

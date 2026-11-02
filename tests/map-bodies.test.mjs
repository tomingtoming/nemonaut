import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {mapViewVector} from '../dist/map-bodies.js';
import {projectTrackingPoint} from '../dist/tracking-orbits.js';
import {SUN_DIRECTION} from '../dist/power.js';

test('Surface camera matches orbit projection including poles and reversed views', () => {
  for (const yaw of [0, 0.4, 1.15, Math.PI, 5.8])
    for (const pitch of [-1.5, -0.4, 0, 0.8, 1.5]) {
      const camera = new T.PerspectiveCamera();
      camera.position.copy(mapViewVector(0, 0, 1, yaw, pitch));
      camera.up.copy(mapViewVector(0, 1, 0, yaw, pitch));
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      for (const point of [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        [0.2, -0.6, 0.7]
      ]) {
        const screen = projectTrackingPoint(point, yaw, pitch),
          back = mapViewVector(...screen, yaw, pitch);
        assert.ok(back.distanceTo(new T.Vector3(...point)) < 1e-12);
        const view = new T.Vector3(...point).transformDirection(camera.matrixWorldInverse);
        const expected = new T.Vector3(...screen).normalize();
        assert.ok(view.distanceTo(expected) < 1e-12);
        const light = projectTrackingPoint(SUN_DIRECTION.toArray(), yaw, pitch);
        assert.ok(
          Math.abs(
            new T.Vector3(...screen).dot(new T.Vector3(...light)) - new T.Vector3(...point).dot(SUN_DIRECTION)
          ) < 1e-12
        );
      }
    }
});

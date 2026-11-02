import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {FlightScenery, surfaceMaterial} from '../dist/flight-scenery.js';
import {center, PLANET} from '../dist/planet.js';
import {SUN_DIRECTION} from '../dist/power.js';
test('Sky follows the camera, fades with altitude and keeps stars on the night side', () => {
  const group = new T.Group(),
    view = new FlightScenery(group),
    camera = new T.PerspectiveCamera(),
    sun = new T.DirectionalLight(),
    ambient = new T.HemisphereLight(),
    material = surfaceMaterial();
  try {
    camera.position.copy(center).addScaledVector(SUN_DIRECTION, PLANET.radius + 10);
    view.update(camera, 0, sun, ambient, [material]);
    assert.ok(view.uniforms.air.value > 0.99);
    assert.ok(view.stars.material.opacity < 0.01);
    assert.equal(sun.intensity, 2.4);
    camera.position.copy(center).addScaledVector(SUN_DIRECTION, PLANET.radius + 80000);
    view.update(camera, 100, sun, ambient, [material]);
    assert.ok(view.stars.material.opacity > 0.99);
    assert.ok(view.sky.position.equals(camera.position));
    camera.position.copy(center).addScaledVector(SUN_DIRECTION, -PLANET.radius - 10);
    view.update(camera, 200, sun, ambient, [material]);
    assert.equal(sun.intensity, 0);
    assert.equal(view.stars.material.opacity, 1);
    assert.ok(
      group.children.some(o => o.isDirectionalLight && o.layers.mask === 2 && o.intensity > 0),
      'planet day-side light remains independent of observer eclipse'
    );
  } finally {
    group.traverse(o => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    material.dispose();
  }
});

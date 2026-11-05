import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {FlightScenery, surfaceMaterial} from '../dist/flight-scenery.js';
import {center, PLANET} from '../dist/planet.js';
import {launchSiteOrientation, surfaceOrientation} from '../dist/surface-frame.js';
test('Camera crossing sea surface switches fog, atmosphere, stars and light, then restores them', () => {
  const group = new T.Group(),
    view = new FlightScenery(group),
    camera = new T.PerspectiveCamera(),
    sun = new T.DirectionalLight(),
    ambient = new T.HemisphereLight(),
    materials = [surfaceMaterial()];
  try {
    for (const time of [0, 192900]) {
      const position = (alt, site = 'water') =>
        camera.position
          .copy(
            new T.Vector3(0, PLANET.radius + alt, 0)
              .applyQuaternion(launchSiteOrientation(site))
              .applyQuaternion(surfaceOrientation(time))
          )
          .add(center);
      position(8);
      assert.equal(view.update(camera, time, sun, ambient, materials), null);
      const originalLight = sun.intensity,
        originalAmbient = ambient.intensity,
        stars = view.stars.material.opacity;
      assert.equal(view.shell.visible, true);
      position(-5);
      const fog = view.update(camera, time, sun, ambient, materials);
      assert.ok(fog?.isFogExp2);
      assert.equal(view.shell.visible, false);
      assert.equal(view.stars.material.opacity, 0);
      assert.ok(Math.abs(view.uniforms.waterDepth.value - 5) < 1e-6);
      assert.ok(ambient.intensity < originalAmbient);
      position(-100);
      assert.equal(view.update(camera, time, sun, ambient, materials), fog);
      assert.ok(ambient.intensity < originalAmbient * 0.2);
      position(8);
      assert.equal(view.update(camera, time, sun, ambient, materials), null);
      assert.equal(view.shell.visible, true);
      assert.equal(view.uniforms.waterDepth.value, 0);
      assert.equal(sun.intensity, originalLight);
      assert.equal(ambient.intensity, originalAmbient);
      assert.equal(view.stars.material.opacity, stars);
      position(-5, 'land');
      assert.equal(view.update(camera, time, sun, ambient, materials), null);
      assert.equal(view.shell.visible, true);
    }
    assert.equal(materials[0].side, T.DoubleSide);
  } finally {
    group.traverse(o => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    for (const m of materials) m.dispose();
  }
});

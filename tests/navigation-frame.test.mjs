import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {navigationVelocity, navDirections} from '../dist/navigation.js';
import {surfaceVelocity, fixedToInertial} from '../dist/surface-frame.js';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
test('Surface and orbital speed and markers share their reference velocity', () => {
  for (const time of [0, 193310]) {
    const p = fixedToInertial(new T.Vector3(0, 600000, 0), time),
      v = surfaceVelocity(p, time);
    assert.ok(navigationVelocity(p, v, time, 'surface').length() < 1e-10);
    assert.ok(navigationVelocity(p, v, time, 'orbit').length() > 170);
    assert.equal(navDirections(p, v, time, 'surface').prograde, null);
    assert.ok(navDirections(p, v, time, 'orbit').prograde);
    v.add(new T.Vector3(50, 0, 0));
    const surface = navDirections(p, v, time, 'surface'),
      orbit = navDirections(p, v, time, 'orbit');
    assert.ok(surface.prograde.distanceTo(new T.Vector3(1, 0, 0)) < 1e-10);
    assert.ok(surface.prograde.angleTo(orbit.prograde) > 1);
    assert.ok(surface.retrograde.dot(surface.prograde) < -0.9999);
  }
});
test('Surface SAS follows the same marker; save, legacy load and separation preserve frame policy', () => {
  const f = new Flight(preset('launcher'), 'orbit', 1234);
  let loaded;
  try {
    f.navigationAuto = false;
    f.navigationFrame = 'surface';
    f.sasMode = 'prograde';
    const com = f.stats.com.clone().applyQuaternion(f.q).add(f.pos);
    f.vel.copy(surfaceVelocity(com, f.universalTime)).add(new T.Vector3(50, 0, 0));
    const expected = navDirections(com, f.vel, f.universalTime, 'surface').prograde;
    f.step(1 / 120);
    assert.ok(new T.Vector3(0, 1, 0).applyQuaternion(f.holdQ).angleTo(expected) < 0.001);
    const saved = saveFlight(f);
    loaded = loadFlight(saved);
    assert.equal(loaded.navigationFrame, 'surface');
    loaded.dispose();
    loaded = null;
    delete saved.navigationFrame;
    loaded = loadFlight(saved);
    assert.equal(loaded.navigationFrame, 'orbit');
    loaded.dispose();
    loaded = null;
    saved.navigationFrame = 'invalid';
    assert.throws(() => loadFlight(saved));
    f.stageNext();
    f.stageNext();
    assert.ok(f.detached.length);
    assert.ok(f.detached.every(c => c.navigationFrame === 'surface'));
  } finally {
    f.dispose();
    loaded?.dispose();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {Group, Raycaster, Vector3} from 'three';
import {addRunwayMarkings} from '../dist/runway-scenery.js';
import {RUNWAY} from '../dist/runway-navigation.js';

test('threshold numbers read in approach direction and taxiway spans the apron gap', () => {
  const site = new Group();
  addRunwayMarkings(site);
  function painted(name, x, z) {
    const ray = new Raycaster(new Vector3(x, 8, z), new Vector3(0, -1, 0));
    return ray.intersectObject(site.getObjectByName(name)).length > 0;
  }
  // Each row samples the left, middle and right across the two glyphs.
  for (const [end, forward, expected] of [
    ['09', 1, ['111111', '101101', '101111', '101001', '111111']],
    ['27', -1, ['111111', '001001', '111001', '100001', '111001']]
  ]) {
    const start = RUNWAY.center - (forward * RUNWAY.length) / 2;
    const rows = [5, 2.5, 0, -2.5, -5].map(up =>
      [-2.15, 2.15]
        .flatMap(mid =>
          [-1.1, 0, 1.1].map(right =>
            Number(painted('Runway ' + end, -forward * (mid + right), start + forward * (34 + up)))
          )
        )
        .join('')
    );
    assert.deepEqual(rows, expected);
  }
  assert.ok(painted('SPH taxiway', RUNWAY.width / 2 + 0.01, 0));
  assert.ok(painted('SPH taxiway', 42.5, 0));
  assert.ok(!painted('SPH taxiway', RUNWAY.width / 2 - 0.01, 0));
});

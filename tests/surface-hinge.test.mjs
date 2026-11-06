import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PARTS} from '../dist/catalog.js';
import {installLargeParts, LARGE_VARIANTS} from '../dist/large-parts.js';
import {makeSurfaceHinge} from '../dist/surface-hinge.js';
import {catalogContractErrors} from '../tools/catalog-contract.mjs';
import {scalingErrors, CURRENT_GEOMETRY_OVERRIDES} from '../tools/catalog-scaling.mjs';

test('all control surfaces keep their previous neutral and deflected model positions', () => {
  for (const [type, d] of Object.entries(PARTS).filter(([, d]) => d.controlAxis)) {
    const visual = new T.Group(),
      hinge = makeSurfaceHinge(visual, d);
    const oldPivot = new T.Vector3(0, type === 'fin' ? 0.13 : d.size[1] / 2, 0);
    for (const angle of [-0.3, 0, 0.3]) {
      hinge.rotation.x = angle;
      hinge.updateMatrixWorld(true);
      for (const point of [
        [0, 0, 0],
        [0.7, -0.4, 0.2],
        [-0.3, 0.5, -0.1]
      ]) {
        const expected = new T.Vector3(...point)
          .sub(oldPivot)
          .applyAxisAngle(new T.Vector3(1, 0, 0), angle)
          .add(oldPivot);
        assert.ok(visual.localToWorld(new T.Vector3(...point)).distanceTo(expected) < 1e-10, type);
      }
    }
  }
});

test('moving both datum and pivot preserves a deflected surface under arbitrary part rotation', () => {
  const origin = new T.Vector3(4, 5, 6),
    delta = new T.Vector3(1, -0.2, 0.3);
  const rotation = new T.Quaternion().setFromEuler(new T.Euler(0.4, -0.7, 1.2));
  const before = new T.Group(),
    after = new T.Group();
  before.position.copy(origin);
  after.position.copy(origin).add(delta.clone().applyQuaternion(rotation));
  before.quaternion.copy(rotation);
  after.quaternion.copy(rotation);
  const a = new T.Group(),
    b = new T.Group();
  // Model points also move by -delta in the new datum.
  b.position.copy(delta).negate();
  const h1 = makeSurfaceHinge(a, PARTS.fin);
  const h2 = makeSurfaceHinge(b, {
    size: PARTS.fin.size,
    hingePivot: new T.Vector3(...PARTS.fin.hingePivot).sub(delta).toArray()
  });
  before.add(h1);
  after.add(h2);
  for (const angle of [-0.4, 0, 0.4]) {
    h1.rotation.x = angle;
    h2.rotation.x = angle;
    before.updateMatrixWorld(true);
    after.updateMatrixWorld(true);
    for (const point of [
      [0, 0, 0],
      [2, 0.5, 0.1],
      [1, -0.7, -0.1]
    ])
      assert.ok(
        a.localToWorld(new T.Vector3(...point)).distanceTo(b.localToWorld(new T.Vector3(...point))) < 1e-10
      );
  }
});

test('large control surface pivots scale all three coordinates and malformed definitions fail', () => {
  const catalog = structuredClone(PARTS);
  catalog.elevator.hingePivot = [0.2, -0.3, 0.4];
  installLargeParts(catalog);
  assert.deepEqual(catalog.elevatorLarge.hingePivot, [0.2 * 3, -0.3 * 3, 0.4 * 3]);
  assert.deepEqual(catalog.transportElevator.hingePivot, [0.2 * 5, -0.3 * 5, 0.4 * 5]);
  assert.deepEqual(scalingErrors(catalog, LARGE_VARIANTS, CURRENT_GEOMETRY_OVERRIDES), []);
  catalog.elevatorLarge.hingePivot[2] = 0;
  assert.ok(
    scalingErrors(catalog, LARGE_VARIANTS, CURRENT_GEOMETRY_OVERRIDES).includes('elevatorLarge: hingePivot')
  );
  for (const hingePivot of [
    [0, 0],
    [0, NaN, 0],
    [0, 0, Infinity]
  ])
    assert.ok(catalogContractErrors({bad: {...PARTS.fin, hingePivot}}).some(e => e.includes('hingePivot')));
  assert.ok(
    catalogContractErrors({bad: {...PARTS.fin, hingeY: 0.13}}).some(e => e.includes('replaces hingeY'))
  );
  assert.ok(
    catalogContractErrors({bad: {...PARTS.tank, hingePivot: [0, 0, 0]}}).some(e =>
      e.includes('requires controlAxis')
    )
  );
});

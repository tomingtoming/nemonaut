import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PARTS} from '../dist/catalog.js';
import {catalogContractErrors} from '../tools/catalog-contract.mjs';

test('assembled catalog satisfies authoring contracts', () => {
  assert.deepEqual(catalogContractErrors(PARTS), []);
});

const mutations = [
  ['mass', p => (p.mass = 0)],
  ['size', p => (p.size = [1, -1, 1])],
  ['size', p => (p.size = [1, 1])],
  ['finite', p => (p.fuel = NaN)],
  [
    'gimbalPivot',
    p => {
      p.gimbal = 6;
      delete p.gimbalPivot;
    }
  ],
  [
    'gimbalPivot',
    p => {
      p.gimbal = 6;
      p.gimbalPivot = [0, Infinity, 0];
    }
  ],
  [
    'requires thrust',
    p => {
      p.gimbal = 6;
      p.gimbalPivot = [0, 0, 0];
      delete p.thrust;
    }
  ],
  ['controlAxis', p => (p.controlAxis = 'unknown')],
  [
    'requires maxDeflection',
    p => {
      Object.assign(p, PARTS.elevator);
      delete p.maxDeflection;
    }
  ],
  [
    'requires ac',
    p => {
      Object.assign(p, PARTS.elevator);
      delete p.ac;
    }
  ],
  [
    'retractable requires wheel',
    p => {
      p.retractable = true;
      delete p.wheel;
    }
  ],
  [
    'steer requires wheel',
    p => {
      p.steer = true;
      delete p.wheel;
    }
  ],
  [
    'requires rcsIsp',
    p => {
      p.rcsThrust = 120;
      delete p.rcsIsp;
    }
  ],
  ['attachmentNodes normal', p => (p.attachmentNodes = [[0, 0, 0, 0, 0, 0]])]
];
for (const [index, [expected, mutate]] of mutations.entries()) {
  test(`reject catalog mutation: ${expected} (${index})`, () => {
    const part = structuredClone(PARTS.engine);
    mutate(part);
    assert.ok(catalogContractErrors({mutated: part}).some(error => error.includes(expected)));
  });
}
test('duplicate full model codes are rejected', () => {
  assert.ok(
    catalogContractErrors({a: PARTS.engine, b: PARTS.engine}).some(e => e.includes('duplicate code'))
  );
});
test('zero pivot coordinates and implicit surface hinge remain valid', () => {
  assert.deepEqual(catalogContractErrors({screw: PARTS.propellerLarge, elevator: PARTS.elevator}), []);
});

test('finite individual dimensions must not overflow or underflow derived volume and density', () => {
  for (const size of [
    [1e200, 1e200, 1e200],
    [1e-200, 1e-200, 1e-200]
  ]) {
    const errors = catalogContractErrors({extreme: {...PARTS.engine, size}});
    assert.ok(errors.some(e => e.includes('envelope volume')));
    assert.ok(errors.some(e => e.includes('envelope density')));
  }
});

test('motor capability requires a wheel', () => {
  assert.ok(
    catalogContractErrors({bad: {...PARTS.engine, poweredWheel: true}}).some(e =>
      e.includes('poweredWheel requires wheel')
    )
  );
});

test('command frames require a valid mode and a command part', () => {
  assert.ok(
    catalogContractErrors({bad: {...PARTS.probe, commandFrame: 'unknown'}}).some(e =>
      e.endsWith('commandFrame')
    )
  );
  assert.ok(
    catalogContractErrors({bad: {...PARTS.engine, commandFrame: 'axial'}}).some(e =>
      e.includes('requires control')
    )
  );
});

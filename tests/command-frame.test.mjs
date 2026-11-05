import test from 'node:test';
import assert from 'node:assert/strict';
import {PARTS, part, preset} from '../dist/catalog.js';
import {usesAxialControls} from '../dist/command-frame.js';
import {Flight} from '../dist/core.js';
import {loadFlight, saveFlight} from '../dist/flight-save.js';

test('existing presets retain their assembly control frame', () => {
  for (const kind of [
    'rocket',
    'launcher',
    'returner',
    'atlas',
    'plane',
    'rover',
    'sub',
    'boat',
    'plane-large',
    'boat-large',
    'sub-large'
  ]) {
    const parts = preset(kind);
    assert.ok(parts.length, kind);
    const previous =
      parts.some(p => p.type === 'capsule') ||
      (parts.some(p => p.type === 'probe') &&
        parts.some(
          p =>
            PARTS[p.type].thrust &&
            !['jet', 'jetLarge', 'transportJet', 'propeller', 'propellerLarge'].includes(p.type)
        ) &&
        !parts.some(p => PARTS[p.type].aircraftControl));
    assert.equal(usesAxialControls(parts, PARTS), previous, kind);
  }
});
test('frame priority and automatic compatibility mode are explicit', () => {
  const catalog = {
    vertical: {...PARTS.capsule},
    horizontal: {...PARTS.cockpit},
    auto: {...PARTS.probe},
    motor: {...PARTS.engine},
    jet: {...PARTS.jet},
    screw: {...PARTS.propeller}
  };
  const check = (...types) =>
    usesAxialControls(
      types.map(type => ({type})),
      catalog
    );
  assert.equal(check('vertical', 'horizontal'), true);
  assert.equal(check('auto', 'motor'), true);
  assert.equal(check('auto', 'motor', 'horizontal'), false);
  assert.equal(check('auto', 'jet'), false);
  assert.equal(check('auto', 'screw'), false);
  assert.equal(check('auto'), false);
  assert.equal(check(), false);
});
test('renamed axial controller reaches Flight and survives saved restoration', () => {
  const original = PARTS.cockpit;
  let f, restored;
  try {
    PARTS.cockpit = {...PARTS.capsule};
    f = new Flight([part('cockpit')], 'land');
    assert.equal(f.rocketAxes, true);
    restored = loadFlight(saveFlight(f));
    assert.equal(restored.rocketAxes, true);
    assert.equal(
      usesAxialControls([{type: 'capsule'}], {
        ...PARTS,
        capsule: {...PARTS.capsule, commandFrame: 'forward'}
      }),
      false
    );
  } finally {
    f?.dispose();
    restored?.dispose();
    PARTS.cockpit = original;
  }
});

test('automatic frame requires a declared independent engine, not missing medium flags', () => {
  const parts = [{type: 'probe'}, {type: 'engine'}];
  assert.equal(usesAxialControls(parts, PARTS), true);
  assert.equal(
    usesAxialControls(parts, {...PARTS, engine: {...PARTS.engine, thrustMedium: undefined}}),
    false
  );
  assert.equal(usesAxialControls(parts, {...PARTS, engine: {...PARTS.engine, thrustMedium: 'air'}}), false);
});

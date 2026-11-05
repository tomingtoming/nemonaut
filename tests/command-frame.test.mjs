import {Vector3} from 'three';
import {manualTranslation} from '../dist/flight-input.js';
import {selectReference} from '../dist/command-frame.js';
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
        !parts.some(p => ['cockpit', 'cockpitLarge', 'transportCockpit', 'marineCabin'].includes(p.type)));
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

test('mounted instrument turns the nose, manual RCS and flight save together', () => {
  const craft = preset('rocket');
  const pod = craft.find(p => p.type === 'capsule');
  pod.r = [0, 0, -Math.PI / 2];
  const f = new Flight(craft, 'orbit');
  let restored;
  const nose = vessel => new Vector3(0, 1, 0).applyQuaternion(vessel.instrumentRotation);
  try {
    assert.ok(nose(f).distanceTo(new Vector3(1, 0, 0)) < 1e-8);
    selectReference(f.parts, pod.id, 1, PARTS);
    assert.ok(nose(f).distanceTo(new Vector3(-1, 0, 0)) < 1e-8);
    selectReference(f.parts, pod.id, 2, PARTS);
    const input = manualTranslation(new Set(['KeyI']), true, 0.25, f.instrumentRotation);
    assert.ok(
      new Vector3(input.translateX, input.translateY, input.translateZ).distanceTo(new Vector3(0, -1, 0)) <
        1e-8
    );
    assert.equal(input.portForward, 0.25);
    f.sas = false;
    f.step(1 / 120, {roll: 1});
    assert.ok(f.telemetry.commands.yaw < -0.99);
    restored = loadFlight(saveFlight(f));
    assert.ok(nose(restored).distanceTo(nose(f)) < 1e-8);
  } finally {
    f.dispose();
    restored?.dispose();
  }
});

test('a retained probe changes to its own axes immediately when the axial pod separates', () => {
  const probe = part('probe'),
    ring = part('decoupler', [0, -1, 0], [0, 0, 0], probe.id),
    pod = part('capsule', [0, -2, 0], [0, 0, 0], ring.id);
  const f = new Flight([probe, ring, pod], 'orbit');
  let restored;
  try {
    assert.equal(f.rocketAxes, true);
    f.separateRoots([ring]);
    assert.equal(f.rocketAxes, false);
    assert.equal(f.detached[0].rocketAxes, true);
    f.sas = false;
    f.step(1 / 120, {roll: 1});
    assert.equal(f.telemetry.commands.roll, 1);
    assert.equal(f.telemetry.commands.yaw, 0);
    restored = loadFlight(saveFlight(f));
    assert.equal(restored.rocketAxes, f.rocketAxes);
  } finally {
    f.dispose();
    restored?.dispose();
  }
});

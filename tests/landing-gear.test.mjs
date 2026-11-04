import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {
  isRetractable,
  hasRetractableGear,
  gearRetracted,
  gearOnGround,
  setGear,
  gearTravel,
  gearFold
} from '../dist/landing-gear.js';
import {vesselControls} from '../dist/vessel-controls.js';

const airborne = {
  parts: [{id: 'g', type: 'maingear'}],
  landed: false,
  time: 10,
  environment: 'runway',
  telemetry: {groundContact: false},
  wheelMotion: new Map([['g', {extension: 0.18}]])
};

test('retractable gear is a part property: aircraft gear and its large variants, not drive wheels or legs', () => {
  for (const type of ['nosegear', 'maingear', 'nosegearLarge', 'maingearLarge'])
    assert.equal(isRetractable(type), true, type);
  for (const type of ['wheel', 'landingLeg', 'tank', 'nope']) assert.equal(isRetractable(type), false, type);
  for (const [type, d] of Object.entries(PARTS))
    if (d.landingLeg) assert.equal(isRetractable(type), false, 'landing legs stay down: ' + type);
  assert.equal(hasRetractableGear(preset('plane')), true);
  assert.equal(hasRetractableGear(preset('plane-large')), true);
  assert.equal(hasRetractableGear(preset('rover')), false, 'driven rover wheels do not fold');
  assert.equal(hasRetractableGear(preset('rocket')), false);
  assert.equal(gearRetracted({type: 'maingear'}, false), true);
  assert.equal(gearRetracted({type: 'maingear'}, true), false);
  assert.equal(gearRetracted({type: 'wheel'}, false), false);
});

test('the controls panel lists G (touch: the gear button) only for craft with retractable gear', () => {
  const row = rows => rows.find(r => r.action === 'ギアの出し入れ');
  assert.equal(row(vesselControls(preset('plane'))).how, 'G');
  assert.match(row(vesselControls(preset('plane'), {touch: true})).how, /「ギア上げ \/ 下げ」/);
  for (const kind of ['rover', 'rocket', 'sub'])
    assert.equal(row(vesselControls(preset(kind))), undefined, kind);
  const camera = vesselControls(preset('rocket')).find(r => r.action === 'カメラを機体に合わせる');
  assert.equal(camera.how, 'V', 'flight framing moved from F to V (F is for the flaps, 9d)');
});

test('ground check: landed, any ground contact, a tyre in its travel, or a ground start not yet stepped', () => {
  assert.equal(gearOnGround(airborne), false);
  assert.equal(gearOnGround({...airborne, landed: true}), true);
  assert.equal(gearOnGround({...airborne, telemetry: {groundContact: true}}), true);
  assert.equal(gearOnGround({...airborne, wheelMotion: new Map([['g', {extension: 0.1}]])}), true);
  assert.equal(gearOnGround({...airborne, time: 0, wheelMotion: new Map()}), true);
  assert.equal(gearOnGround({...airborne, time: 0, environment: 'drop', wheelMotion: new Map()}), false);
});

test('the gear visual travels over one second and folds back and in', () => {
  assert.equal(gearTravel(1, false, 0.25), 0.75);
  assert.equal(gearTravel(0.1, false, 0.25), 0);
  assert.equal(gearTravel(0.5, true, 1), 1);
  assert.equal(gearTravel(0.5, true, -1), 0.5, 'time never runs backwards');
  assert.deepEqual(gearFold(1), {angle: 0, scale: 1});
  const up = gearFold(0);
  assert.ok(Math.abs(up.angle - Math.PI / 2) < 1e-12);
  assert.ok(up.scale < 0.5);
});

test('on the runway the gear cannot be retracted; saves keep the flag (old saves: down)', () => {
  const f = new Flight(preset('plane'), 'runway');
  let restored, legacy;
  try {
    assert.equal(f.gearDeployed, true, 'deployed at launch');
    assert.equal(setGear(f, false), 'refused', 'before the first step');
    for (let i = 0; i < 120; i++) f.step(1 / 120, {});
    assert.ok(f.telemetry.contacts > 0, 'standing on its wheels');
    assert.equal(setGear(f, false), 'refused');
    assert.equal(f.gearDeployed, true);
    assert.equal(setGear(f, true), 'unchanged');
    const rocket = new Flight(preset('rocket'), 'orbit');
    assert.equal(setGear(rocket, false), 'none', 'nothing to fold');
    rocket.dispose();
    // A retracted vessel round-trips; a save written before 9c loads with the gear down.
    f.gearDeployed = false;
    const saved = saveFlight(f);
    assert.equal(saved.gearDeployed, false);
    restored = loadFlight(saved);
    assert.equal(restored.gearDeployed, false);
    delete saved.gearDeployed;
    legacy = loadFlight(saved);
    assert.equal(legacy.gearDeployed, true);
    saved.gearDeployed = 'no';
    assert.throws(() => loadFlight(saved));
  } finally {
    f.dispose();
    restored?.dispose();
    legacy?.dispose();
  }
});

test('retracting in the air removes the gear drag and shrinks its collider at the same mass centre', () => {
  const f = new Flight(preset('plane'), 'drop');
  try {
    f.step(1 / 120, {});
    const forward = new T.Vector3(0, 0, 1),
      gearIds = f.parts.filter(p => isRetractable(p.type)).map(p => p.id),
      drag = f.bodyAerodynamics.dragArea(forward),
      com = new T.Vector3().copy(f.body.localCom()),
      ball = f.colliders.get(gearIds[0]);
    assert.ok(Math.abs(ball.radius() - 0.35) < 1e-6);
    assert.equal(setGear(f, false), 'retracted');
    const folded = f.colliders.get(gearIds[0]);
    assert.ok(folded.radius() < 0.05, 'small ball once folded');
    assert.ok(Math.abs(folded.friction() - 0.35) < 1e-6, 'scrapes, does not roll');
    assert.ok(new T.Vector3().copy(f.body.localCom()).distanceTo(com) < 1e-5, 'mass centre unchanged');
    const less = f.bodyAerodynamics.dragArea(forward);
    // Three gear legs of 0.34 m × 0.7 m frontal box at Cd 0.4 in the body-drag model: ~0.095 m² each.
    assert.ok(drag - less > 0.2 && drag - less < 0.3, `gear CdA ${drag - less}`);
    assert.equal(setGear(f, true), 'deployed');
    assert.ok(Math.abs(f.bodyAerodynamics.dragArea(forward) - drag) < 1e-9);
    assert.ok(Math.abs(f.colliders.get(gearIds[0]).radius() - 0.35) < 1e-6);
  } finally {
    f.dispose();
  }
});

test('retracted gear has no wheel contact: forced up on the runway the plane settles onto its gear bays', () => {
  const down = new Flight(preset('plane'), 'runway'),
    up = new Flight(preset('plane'), 'runway');
  try {
    up.gearDeployed = false;
    up.buildColliders();
    for (let i = 0; i < 240; i++) {
      down.step(1 / 120, {});
      up.step(1 / 120, {});
    }
    assert.ok(down.telemetry.contacts > 0);
    assert.equal(up.telemetry.contacts, 0, 'no suspension contact for folded gear');
    const height = f => f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)).y;
    assert.ok(height(down) - height(up) > 0.25, 'drops below the wheel height without the suspension');
    assert.equal(up.crashed, false);
  } finally {
    down.dispose();
    up.dispose();
  }
});

test('Swift flies faster with the gear up at the same throttle', t => {
  const f = new Flight(preset('plane'), 'runway');
  let down, up;
  try {
    f.throttle = 1;
    f.stageNext();
    for (let i = 0; i < 32 * 120; i++) f.step(1 / 120, {pitch: i > 10 * 120 ? -1 : 0});
    assert.equal(f.crashed, false);
    assert.ok(f.orbit.altitude > 50);
    down = loadFlight(saveFlight(f));
    up = loadFlight(saveFlight(f));
    assert.equal(setGear(up, false), 'retracted');
    for (let i = 0; i < 20 * 120; i++) {
      down.step(1 / 120, {});
      up.step(1 / 120, {});
    }
    const speed = v => v.telemetry.surfaceSpeed;
    assert.equal(up.crashed, false);
    assert.equal(down.crashed, false);
    assert.ok(speed(up) > speed(down) + 1, `gear up ${speed(up)} m/s vs down ${speed(down)} m/s`);
    t.diagnostic(`after 20 s: gear up ${speed(up).toFixed(2)} m/s, down ${speed(down).toFixed(2)} m/s`);
  } finally {
    f.dispose();
    down?.dispose();
    up?.dispose();
  }
});

test('the flag is per vessel: a separated stage keeps the gear state it had, then switches on its own', () => {
  const parts = preset('launcher'),
    separator = parts.find(p => p.type === 'decoupler');
  parts.push({...structuredClone(parts[0]), id: crypto.randomUUID(), type: 'maingear', parent: separator.id});
  const f = new Flight(parts, 'orbit');
  try {
    assert.equal(setGear(f, false), 'retracted');
    f.stageNext();
    f.stageNext();
    const child = f.detached.find(v => v.parts.some(p => p.type === 'maingear'));
    assert.ok(child, 'the gear went with a separated stage');
    assert.equal(child.gearDeployed, false);
    child.gearDeployed = true;
    assert.equal(f.gearDeployed, false, 'separate switches');
  } finally {
    f.dispose();
  }
});

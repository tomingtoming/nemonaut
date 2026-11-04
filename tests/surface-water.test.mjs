import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {WATER_DENSITY, mediumDensity, submergedFraction} from '../dist/buoyancy.js';
import {surfaceForce, surfaceForceScale} from '../dist/aero.js';
import {Flight} from '../dist/core.js';
import {preset, part} from '../dist/catalog.js';
import {bodyUp, referenceBody} from '../dist/celestial.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
import {vesselControls} from '../dist/vessel-controls.js';

const AIR = 1.225;
const run = (f, seconds, input = {}) => {
  for (let i = 0; i < seconds * 120; i++) f.step(1 / 120, input);
};
const waterSpeed = f =>
  surfaceRelativeVelocity(f.pos, f.vel, f.universalTime, referenceBody(f.pos, f.universalTime)).length();
const heading = (f, from) => {
  const up = bodyUp(f.pos, f.universalTime),
    fw = new T.Vector3(0, 0, 1).applyQuaternion(f.q);
  fw.addScaledVector(up, -fw.dot(up)).normalize();
  return from ? (Math.atan2(from.clone().cross(fw).dot(up), from.dot(fw)) * 180) / Math.PI : fw;
};

test('the submerged fraction ramps over the part height like the buoyancy samples', () => {
  assert.equal(submergedFraction(1, 0.2), 0);
  assert.equal(submergedFraction(-1, 0.2), 1);
  assert.equal(submergedFraction(0, 0.2), 0.5);
  assert.ok(Math.abs(submergedFraction(0.06, 0.2) - 0.25) < 1e-12);
  // A thin flat surface still crosses the water line over at least 12 cm.
  assert.equal(submergedFraction(0.06, 0.01), 0);
  assert.equal(submergedFraction(-0.06, 0.01), 1);
});
test('the fluid density blends air and water by the submerged fraction', () => {
  assert.equal(mediumDensity(AIR, 0), AIR, 'exactly the air density out of the water');
  assert.equal(mediumDensity(0, 0), 0);
  assert.equal(mediumDensity(AIR, 1), WATER_DENSITY);
  assert.equal(mediumDensity(AIR, 2), WATER_DENSITY);
  assert.ok(Math.abs(mediumDensity(AIR, 0.5) - (AIR + WATER_DENSITY) / 2) < 1e-9);
  assert.equal(WATER_DENSITY, 1000);
});
test('a submerged surface gives the same coefficients with the force of the water density', () => {
  const rudder = part('rudder', [0, 0, 0], [Math.PI / 2, Math.PI / 2, 0]),
    q = new T.Quaternion().setFromEuler(new T.Euler(...rudder.r)),
    flow = new T.Vector3(0.3, 0, -4);
  const air = surfaceForce(rudder, q, flow, AIR, 0.3),
    water = surfaceForce(rudder, q, flow, mediumDensity(AIR, 1), 0.3);
  assert.equal(water.cl, air.cl);
  assert.equal(water.stalled, air.stalled);
  assert.ok(
    water.force
      .clone()
      .sub(air.force.clone().multiplyScalar(WATER_DENSITY / AIR))
      .length() < 1e-6
  );
});
test('the stability factor is exactly 1 for ordinary surfaces and reins in a light part with a large surface', () => {
  // A jet's main wing in air at 300 m/s, and the Nautilus rudder in water at 10 m/s.
  assert.equal(surfaceForceScale(AIR, 300, 2.1, 1 / 1000, 1 / 120, 9), 1);
  assert.equal(surfaceForceScale(WATER_DENSITY, 10, 0.32, 1 / 500, 1 / 120, 1), 1);
  // A broken-off 55 kg wing (2.1 m²) at 20 m/s through water would reverse its cross flow within a step.
  const scale = surfaceForceScale(WATER_DENSITY, 20, 2.1, 1 / 55, 1 / 120, 1);
  assert.ok(scale > 0 && scale < 0.2);
  const ratio = (1 / 120) * (1 / 55) * WATER_DENSITY * 20 * 2.1 * (4.5 / 2 + 1.2);
  assert.ok(Math.abs(scale - 1 / ratio) < 1e-12, 'critically damped step');
  assert.ok(surfaceForceScale(WATER_DENSITY, 20, 2.1, 1 / 55, 1 / 120, 2) < scale, 'shared by surfaces');
  assert.equal(surfaceForceScale(WATER_DENSITY, 0, 2.1, 1 / 55, 1 / 120, 1), 1);
});
test('the Nautilus turns with its rudder at the surface and holds the new heading', () => {
  const f = new Flight(preset('sub'), 'water');
  try {
    run(f, 5);
    f.stageNext();
    f.throttle = 1;
    run(f, 15);
    const start = heading(f);
    assert.ok(waterSpeed(f) > 1.5, String(waterSpeed(f)));
    run(f, 8, {yaw: 1});
    const turned = heading(f, start);
    assert.ok(Math.abs(turned) > 45, String(turned));
    run(f, 5);
    const held = heading(f, start);
    assert.ok(Math.abs(held - turned) < 10, `${turned} → ${held}`);
    const back = heading(f);
    run(f, 8, {yaw: -1});
    assert.ok(Math.sign(heading(f, back)) === -Math.sign(turned), 'the other key turns the other way');
    assert.equal(f.crashed, false);
  } finally {
    f.dispose();
  }
});
test('without a surface the same submarine cannot turn', () => {
  const f = new Flight(
    preset('sub').filter(p => p.type !== 'rudder'),
    'water'
  );
  try {
    run(f, 5);
    f.stageNext();
    f.throttle = 1;
    run(f, 10);
    const start = heading(f);
    run(f, 8, {yaw: 1});
    assert.ok(Math.abs(heading(f, start)) < 2);
  } finally {
    f.dispose();
  }
});
test('a submerged rudder at 10 m/s turns smoothly and the turn stays bounded', () => {
  const f = new Flight(preset('sub'), 'water');
  try {
    f.ballast = 0.5;
    run(f, 5);
    f.vel.add(new T.Vector3(0, 0, 1).applyQuaternion(f.q).multiplyScalar(10));
    let maxOmega = 0;
    for (let i = 0; i < 10 * 120; i++) {
      f.step(1 / 120, {yaw: 1});
      maxOmega = Math.max(maxOmega, f.omega.length());
      assert.ok(Number.isFinite(f.pos.x) && Number.isFinite(f.omega.x));
    }
    assert.ok(waterSpeed(f) < 10.1);
    assert.equal(f.failureEvents?.length ?? 0, 0, 'the rudder holds');
    assert.ok(maxOmega < 1, String(maxOmega));
  } finally {
    f.dispose();
  }
});
test('a light part with a large surface thrown through the water slows down instead of fluttering', () => {
  for (const type of ['fin', 'wing', 'rudder'])
    for (const speed of [5, 20, 60]) {
      const f = new Flight([part('probe', [0, 0, 0]), part(type, [0.6, 0, 0], [0.3, 0.2, 0.1])], 'water');
      try {
        f.sas = false;
        f.vel.add(new T.Vector3(0.3, -0.4, 1).normalize().multiplyScalar(speed));
        f.omega.add(new T.Vector3(1, 2, 0.5));
        let fastest = 0;
        for (let i = 0; i < 10 * 120; i++) {
          f.step(1 / 120);
          fastest = Math.max(fastest, waterSpeed(f));
        }
        assert.ok(fastest <= speed + 0.5, `${type} ${speed} m/s → ${fastest}`);
        assert.ok(waterSpeed(f) < 1, `${type} ${speed} m/s ends at ${waterSpeed(f)}`);
      } finally {
        f.dispose();
      }
    }
});
test('a plane coming down on the water does not blow up', () => {
  for (const speed of [20, 40, 70]) {
    const f = new Flight(preset('plane'), 'water');
    try {
      f.sas = false;
      const up = bodyUp(f.pos, 0);
      f.pos.addScaledVector(up, 3);
      f.vel.add(new T.Vector3(0, 0, 1).applyQuaternion(f.q).multiplyScalar(speed)).addScaledVector(up, -1.5);
      let fastest = 0;
      for (let i = 0; i < 8 * 120; i++) {
        f.step(1 / 120);
        fastest = Math.max(fastest, waterSpeed(f));
      }
      assert.ok(fastest < speed + 2, `${speed} m/s → ${fastest}`);
      assert.ok(waterSpeed(f) < speed / 2, `${speed} m/s → ends at ${waterSpeed(f)}`);
    } finally {
      f.dispose();
    }
  }
});
test('the controls panel offers turning for a rudder and for a gimballed screw', () => {
  const turn = parts => vesselControls(parts).some(r => r.action.startsWith('向きを変える'));
  assert.ok(turn(preset('sub')));
  assert.ok(!turn(preset('sub').filter(p => p.type !== 'rudder')));
  assert.ok(turn(preset('sub-large')), 'Leviathan steers with its gimballed screw');
  assert.ok(!turn(preset('boat')), 'the Tern has no way to turn yet');
});

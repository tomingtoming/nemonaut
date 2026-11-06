import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {WATER_DENSITY, mediumDensity, submergedFraction} from '../dist/buoyancy.js';
import {surfaceForce, surfaceForceScale, partCenter} from '../dist/aero.js';
import {Flight} from '../dist/core.js';
import {preset, part, PARTS} from '../dist/catalog.js';
import {PRIMARY, bodyAltitude, bodyUp, referenceBody} from '../dist/celestial.js';
import {
  fixedToInertial,
  launchSiteOrientation,
  overWater,
  surfaceVelocity,
  surfaceRelativeVelocity
} from '../dist/surface-frame.js';
import {vesselControls} from '../dist/vessel-controls.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';

const AIR = 1.225;
for (const epoch of [0, 371, 5000])
  test(`powered water taxi and save restoration at epoch ${epoch}`, () => {
    const parts = preset('plane').filter(p => !['nosegear', 'maingear'].includes(p.type));
    parts.find(p => p.type === 'jet').p[1] = 0.8;
    for (const x of [-1.4, 1.4])
      for (const z of [-1.2, 2]) {
        const float = part('pontoon', [x, -0.3, z], [Math.PI / 2, 0, 0]);
        float.parent = parts[1].id;
        parts.push(float);
      }
    const original = new Flight(parts, 'water', epoch);
    let restored;
    try {
      original.stageNext();
      original.throttle = 1;
      run(original, 30);
      restored = loadFlight(saveFlight(original));
      assert.equal(restored.throttle, 1);
      assert.deepEqual([...restored.fuel], [...original.fuel]);
      const fuelBefore = [...restored.fuel.values()].reduce((a, b) => a + b, 0);
      run(restored, 30);
      assert.equal(restored.failureEvents?.length || 0, 0);
      assert.equal(restored.crashed, false);
      assert.equal(restored.telemetry.groundContact, false);
      assert.ok(waterSpeed(restored) > 35 && waterSpeed(restored) < 45);
      assert.ok(Math.abs(bodyAltitude(restored.pos, restored.universalTime)) < 1);
      assert.ok([...restored.fuel.values()].reduce((a, b) => a + b, 0) < fuelBefore);
    } finally {
      restored?.dispose();
      original.dispose();
    }
  });
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
  assert.ok(!turn(preset('sub').filter(p => !['rudder', 'elevator'].includes(p.type))));
  assert.ok(turn(preset('sub-large')), 'Leviathan steers with its gimballed screw');
  assert.ok(turn(preset('boat')), 'the Tern steers with its rudder');
  assert.ok(!turn(preset('boat').filter(p => p.type !== 'rudder')));
});

const pitch = f => {
  const up = bodyUp(f.pos, f.universalTime),
    fw = new T.Vector3(0, 0, 1).applyQuaternion(f.q);
  return (Math.asin(T.MathUtils.clamp(fw.dot(up), -1, 1)) * 180) / Math.PI;
};
const depth = f => -bodyAltitude(f.pos, f.universalTime);
/** Cruise for 15 s on the surface, then steer for 8 s: the heading change in degrees. */
const ternTurn = (parts, yaw) => {
  const f = new Flight(parts, 'water');
  try {
    run(f, 5);
    f.stageNext();
    f.throttle = 1;
    run(f, 15);
    assert.ok(waterSpeed(f) > 5, String(waterSpeed(f)));
    const start = heading(f);
    for (let i = 0; i < 8 * 120; i++) {
      f.step(1 / 120, {yaw});
      const upright = new T.Vector3(0, 1, 0).applyQuaternion(f.q).dot(bodyUp(f.pos, f.universalTime));
      assert.ok(upright > Math.cos((10 * Math.PI) / 180), 'the catamaran stays level in the turn');
    }
    assert.ok(Math.abs(bodyAltitude(f.pos, f.universalTime)) < 1, 'still floating');
    assert.equal(f.crashed, false);
    return heading(f, start);
  } finally {
    f.dispose();
  }
};
test('the Tern turns with its rudder on the surface: D and A opposite, straight without input', () => {
  const right = ternTurn(preset('boat'), 1),
    left = ternTurn(preset('boat'), -1);
  assert.ok(Math.abs(right) > 45, String(right));
  assert.ok(Math.abs(left) > 45, String(left));
  assert.equal(Math.sign(left), -Math.sign(right));
  assert.ok(Math.abs(ternTurn(preset('boat'), 0)) < 2);
  assert.ok(
    Math.abs(
      ternTurn(
        preset('boat').filter(p => p.type !== 'rudder'),
        1
      )
    ) < 2,
    'the rudder turns it'
  );
});
/** Nautilus with the ballast set, 20 s to settle, then 20 s at full throttle. */
const nautilusUnderway = (parts, ballast, sas = true) => {
  const f = new Flight(parts, 'water');
  f.sas = sas;
  f.ballast = ballast;
  run(f, 20);
  f.stageNext();
  f.throttle = 1;
  run(f, 20);
  return f;
};
const maxPitch = (f, seconds, input = {}) => {
  let most = 0;
  for (let i = 0; i < seconds * 120; i++) {
    f.step(1 / 120, input);
    most = Math.max(most, Math.abs(pitch(f)));
  }
  return most;
};
test('flooded at full throttle the Nautilus planes hold the pitch instead of porpoising', () => {
  const planes = nautilusUnderway(preset('sub'), 1);
  try {
    const most = maxPitch(planes, 40);
    assert.ok(most < 10, String(most));
    assert.ok(depth(planes) > 0.3, 'still submerged');
    assert.equal(planes.crashed, false);
  } finally {
    planes.dispose();
  }
  // Without SAS the planes still damp it to a steady bow-up run (the screw sits below the centre of mass).
  const hands = nautilusUnderway(preset('sub'), 1, false);
  try {
    assert.ok(maxPitch(hands, 40) < 25);
  } finally {
    hands.dispose();
  }
  // Without the planes the same run porpoises past 45° (the report before the planes).
  const bare = nautilusUnderway(
    preset('sub').filter(p => p.type !== 'elevator'),
    1
  );
  try {
    assert.ok(maxPitch(bare, 40) > 45);
  } finally {
    bare.dispose();
  }
});
test('underwater W dives and S climbs the flooded Nautilus', () => {
  for (const [input, sign] of [
    [{pitch: 1}, -1],
    [{pitch: -1}, 1]
  ]) {
    const f = nautilusUnderway(preset('sub'), 1);
    try {
      const before = depth(f);
      for (let i = 0; i < 3 * 120; i++) f.step(1 / 120, input);
      assert.ok(sign * pitch(f) > 20, String(pitch(f)));
      run(f, 4);
      const change = depth(f) - before;
      if (sign < 0) assert.ok(change > 3, 'W goes deeper: ' + change);
      else assert.ok(change < -1, 'S comes up: ' + change);
      assert.equal(f.crashed, false);
    } finally {
      f.dispose();
    }
  }
});
test('the Nautilus planes keep it level at neutral buoyancy and surfaced, with the surfaced speed of before', () => {
  for (const [ballast, slowest] of [
    [0.7, 2],
    [0, 2.5]
  ]) {
    const f = nautilusUnderway(preset('sub'), ballast);
    try {
      assert.ok(maxPitch(f, 20) < 5);
      assert.ok(waterSpeed(f) > slowest, ballast + ': ' + waterSpeed(f));
    } finally {
      f.dispose();
    }
  }
});

test('a buoyant hull from a runway departure crosses the shoreline and floats without ground support', () => {
  const f = new Flight(preset('boat'), 'runway');
  try {
    const latitude = -1980 / PRIMARY.radius;
    const normal = new T.Vector3(Math.sin(latitude), Math.cos(latitude), 0);
    f.pos.copy(fixedToInertial(normal.clone().multiplyScalar(PRIMARY.radius + 3)));
    const south = new T.Vector3(-Math.cos(latitude), Math.sin(latitude), 0);
    f.q.setFromUnitVectors(new T.Vector3(0, 0, 1), south);
    f.vel.copy(surfaceVelocity(f.pos, 0)).addScaledVector(south, 30).addScaledVector(normal, -1.5);
    assert.equal(overWater(f.pos, 0), false);
    run(f, 10);
    assert.ok(overWater(f.pos, f.universalTime));
    assert.equal(f.crashed, false);
    assert.equal(f.telemetry.groundContact, false);
    assert.ok(waterSpeed(f) < 8);
    assert.ok(Math.abs(bodyAltitude(f.pos, f.universalTime)) < 3);
  } finally {
    f.dispose();
  }
});

test('only wheels on the dry side support a rover straddling the coast', () => {
  for (const [northOfShore, wheels] of [
    [-6, 0],
    [0, 2],
    [6, 4]
  ]) {
    const f = new Flight(preset('rover'), 'land');
    try {
      const latitude = (northOfShore - 2000) / PRIMARY.radius;
      f.q.setFromAxisAngle(new T.Vector3(0, 0, 1), -latitude);
      const fixed = new T.Vector3(0, PRIMARY.radius + f.pos.y - 0.13, 0).applyQuaternion(f.q);
      f.pos.copy(fixedToInertial(fixed));
      f.vel.copy(surfaceVelocity(f.pos, 0));
      f.step(1 / 120);
      assert.equal(f.telemetry.contacts, wheels);
      assert.equal(f.telemetry.groundContact, wheels > 0);
    } finally {
      f.dispose();
    }
  }
});

test('a submerged rocket ignites under water and climbs through the surface', () => {
  const f = new Flight(preset('hopper'), 'water');
  try {
    const up = bodyUp(f.pos, 0);
    f.pos.addScaledVector(up, -15);
    const fuel = () => [...f.fuel.values()].reduce((sum, kg) => sum + kg, 0);
    const before = fuel();
    f.stageNext();
    f.throttle = 1;
    f.step(1 / 120);
    assert.ok(bodyAltitude(f.pos, f.universalTime) < -10 && f.lastThrust > 0);
    for (let i = 0; i < 1200 && bodyAltitude(f.pos, f.universalTime) < 5; i++) f.step(1 / 120);
    assert.ok(bodyAltitude(f.pos, f.universalTime) >= 5);
    assert.ok(fuel() < before);
    assert.equal(f.crashed, false);
    assert.equal(f.telemetry.groundContact, false);
  } finally {
    f.dispose();
  }
});

test('a floatplane survives initial gentle sea contact but records a hard downward water entry', () => {
  for (const descent of [2, 35]) {
    const parts = preset('plane').filter(p => !['nosegear', 'maingear'].includes(p.type));
    for (const x of [-1.4, 1.4]) {
      const float = part('pontoon', [x, -0.3, 0], [Math.PI / 2, 0, 0]);
      float.parent = parts[1].id;
      parts.push(float);
    }
    const f = new Flight(parts, 'water');
    try {
      const up = bodyUp(f.pos, 0);
      f.pos.addScaledVector(up, 2);
      f.vel.copy(surfaceVelocity(f.pos, 0)).addScaledVector(up, -descent);
      f.sas = false;
      let touchedWater = false;
      for (let i = 0; i < 120 && !f.failureEvents?.length; i++) {
        f.step(1 / 120);
        touchedWater ||= f.parts
          .filter(p => p.type === 'pontoon')
          .some(p => {
            const point = partCenter(p).applyQuaternion(f.q).add(f.pos),
              normal = bodyUp(point, f.universalTime).applyQuaternion(
                f.q
                  .clone()
                  .multiply(new T.Quaternion().setFromEuler(new T.Euler(...p.r)))
                  .invert()
              ),
              size = PARTS[p.type].size,
              extent =
                (Math.abs(normal.x) * size[0] + Math.abs(normal.y) * size[1] + Math.abs(normal.z) * size[2]) /
                2;
            return bodyAltitude(point, f.universalTime) < extent;
          });
      }
      const impacts = (f.failureEvents || []).filter(e => e.cause === 'impact');
      if (descent === 2) {
        assert.ok(touchedWater, 'the gentle case must actually reach the sea');
        assert.equal(f.failureEvents?.length || 0, 0, JSON.stringify(f.failureEvents));
        assert.equal(f.telemetry.groundContact, false);
      } else {
        assert.ok(impacts.length > 0, JSON.stringify(f.failureEvents));
        assert.ok(impacts.some(e => e.speed > 9));
      }
    } finally {
      f.dispose();
    }
  }
});

test('fore and aft floats keep a runway-departure aircraft upright for 30 seconds after splashdown', () => {
  for (const forwardSpeed of [0, 5, 10, 20, 35]) {
    const parts = preset('plane').filter(p => !['nosegear', 'maingear'].includes(p.type));
    for (const x of [-1.4, 1.4])
      for (const z of [-1.2, 2]) {
        const float = part('pontoon', [x, -0.3, z], [Math.PI / 2, 0, 0]);
        float.parent = parts[1].id;
        parts.push(float);
      }
    const f = new Flight(parts, 'runway');
    try {
      f.q.copy(launchSiteOrientation('water'));
      f.pos.copy(fixedToInertial(new T.Vector3(0, PRIMARY.radius + 2, 0).applyQuaternion(f.q)));
      const up = bodyUp(f.pos, 0),
        forward = new T.Vector3(0, 0, 1).applyQuaternion(f.q);
      f.vel.copy(surfaceVelocity(f.pos, 0)).addScaledVector(up, -2).addScaledVector(forward, forwardSpeed);
      f.sas = false;
      run(f, 30);
      assert.equal(f.failureEvents?.length || 0, 0, JSON.stringify(f.failureEvents));
      assert.equal(f.crashed, false);
      assert.equal(f.telemetry.groundContact, false);
      assert.ok(overWater(f.pos, f.universalTime));
      const tilt = new T.Vector3(0, 1, 0).applyQuaternion(f.q).angleTo(bodyUp(f.pos, f.universalTime));
      assert.ok(tilt < (3 * Math.PI) / 180, 'floats should keep the aircraft upright without SAS');
      assert.ok(Math.abs(bodyAltitude(f.pos, f.universalTime)) < 1);
      assert.ok(
        waterSpeed(f) < Math.max(0.2, forwardSpeed * 0.1),
        'water resistance should remove most of the forward speed'
      );
    } finally {
      f.dispose();
    }
  }
});

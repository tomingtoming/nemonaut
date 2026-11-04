import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {ShapeType} from '../dist/physics.js';
import {bodyUp} from '../dist/celestial.js';
import {angularMomentum} from '../dist/angular-momentum.js';
import {preset, PARTS} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {
  isRetractable,
  hasRetractableGear,
  gearRetracted,
  gearOnGround,
  setGear,
  gearTravel,
  gearFold,
  foldedGearCenter
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

// The lowest point of a collider, in world y (body pose) or in the craft frame (no pose).
function colliderBottom(collider, position = new T.Vector3(), rotation = new T.Quaternion()) {
  const center = new T.Vector3()
    .copy(collider.translationWrtParent())
    .applyQuaternion(rotation)
    .add(position);
  if (collider.shapeType() === ShapeType.Ball) return center.y - collider.radius();
  const h = collider.halfExtents(),
    q = new T.Quaternion().copy(collider.rotationWrtParent()).premultiply(rotation);
  let low = Infinity;
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1])
        low = Math.min(low, center.y + new T.Vector3(x * h.x, y * h.y, z * h.z).applyQuaternion(q).y);
  return low;
}
const isGear = (f, id) => isRetractable(f.parts.find(p => p.id === id).type);
/** The lowest world point of the gear colliders and of the rest of the craft, above the ground's top face. */
function rideHeights(f) {
  const position = new T.Vector3().copy(f.body.translation()),
    rotation = new T.Quaternion().copy(f.body.rotation()),
    ground = f.world.ground.translation.y + 1,
    low = {gear: Infinity, body: Infinity};
  for (const [id, group] of f.colliderGroups)
    for (const {collider} of group) {
      const key = isGear(f, id) ? 'gear' : 'body';
      low[key] = Math.min(low[key], colliderBottom(collider, position, rotation) - ground);
    }
  return low;
}

test('retracting in the air removes the gear drag and folds its mass and collider into the fuselage', () => {
  const f = new Flight(preset('plane'), 'drop');
  try {
    f.step(1 / 120, {});
    f.omega.set(0.01, 0.02, 0.03);
    const forward = new T.Vector3(0, 0, 1),
      gear = f.parts.filter(p => isRetractable(p.type)),
      drag = f.bodyAerodynamics.dragArea(forward),
      down = f.vesselStats().com,
      center = f.pos.clone().add(down.clone().applyQuaternion(f.q)),
      mass = f.body.mass(),
      momentum = angularMomentum(f.body, f.q, f.omega);
    assert.ok(Math.abs(f.colliders.get(gear[0].id).radius() - 0.35) < 1e-6);
    assert.ok(new T.Vector3().copy(f.body.localCom()).distanceTo(down) < 1e-5);
    assert.equal(setGear(f, false), 'retracted');
    const up = f.vesselStats().com,
      inside = new T.Quaternion().copy(f.body.rotation()),
      origin = new T.Vector3().copy(f.body.translation());
    for (const p of gear) {
      const folded = f.colliders.get(p.id),
        at = foldedGearCenter(p, f.parts);
      assert.ok(
        Math.abs(folded.radius() - 0.35 * gearFold(0).scale) < 1e-6,
        'the wheel shrunk as its visual'
      );
      assert.ok(Math.abs(folded.friction() - 0.35) < 1e-6, 'scrapes, does not roll');
      assert.ok(new T.Vector3().copy(folded.translationWrtParent()).distanceTo(at) < 1e-5);
      assert.ok(at.y > 1, `${p.type} folds up into the body: ${at.toArray()}`);
      // The folded wheel's centre and its lowest point lie inside the fuselage or cockpit box.
      const world = at.clone().applyQuaternion(inside).add(origin),
        reach = new T.Vector3(0, -folded.radius(), 0).applyQuaternion(inside);
      assert.ok(
        [...f.colliderGroups].some(
          ([id, group]) =>
            !isGear(f, id) &&
            group.some(
              ({collider}) =>
                collider.containsPoint(world) && collider.containsPoint(world.clone().add(reach))
            )
        ),
        p.type + ' is inside the body'
      );
    }
    // Statistics and the solver share the new mass centre; the craft shifts so it stays put in space.
    assert.ok(new T.Vector3().copy(f.body.localCom()).distanceTo(up) < 1e-5, 'localCom follows statistics');
    assert.ok(Math.abs(f.body.mass() - mass) < 0.01);
    assert.ok(up.y - down.y > 0.02 && up.y - down.y < 0.04, `the centre of mass rises ${up.y - down.y} m`);
    assert.ok(f.stats.com.distanceTo(up) < 1e-9);
    assert.ok(
      f.pos.clone().add(up.clone().applyQuaternion(f.q)).distanceTo(center) < 1e-6,
      'no jump in space'
    );
    assert.ok(angularMomentum(f.body, f.q, f.omega).distanceTo(momentum) < 0.01, 'angular momentum kept');
    const less = f.bodyAerodynamics.dragArea(forward);
    // Three gear legs of 0.34 m × 0.7 m frontal box at Cd 0.4 in the body-drag model: ~0.095 m² each.
    assert.ok(drag - less > 0.2 && drag - less < 0.3, `gear CdA ${drag - less}`);
    assert.equal(setGear(f, true), 'deployed');
    assert.ok(Math.abs(f.bodyAerodynamics.dragArea(forward) - drag) < 1e-9);
    assert.ok(Math.abs(f.colliders.get(gear[0].id).radius() - 0.35) < 1e-6);
    assert.ok(f.vesselStats().com.distanceTo(down) < 1e-9, 'back to the gear-down mass centre');
    assert.ok(new T.Vector3().copy(f.body.localCom()).distanceTo(down) < 1e-5);
    assert.ok(f.pos.clone().add(down.clone().applyQuaternion(f.q)).distanceTo(center) < 1e-6);
    // A gear-up save restores the same mass centre.
    setGear(f, false);
    const restored = loadFlight(saveFlight(f));
    try {
      assert.ok(restored.stats.com.distanceTo(up) < 1e-9);
      assert.ok(new T.Vector3().copy(restored.body.localCom()).distanceTo(up) < 1e-5);
    } finally {
      restored.dispose();
    }
  } finally {
    f.dispose();
  }
});

test('gear up on the runway, Swift settles on its belly: fuselage on the ground, folded wheels clear', () => {
  const down = new Flight(preset('plane'), 'runway'),
    up = new Flight(preset('plane'), 'runway');
  try {
    up.gearDeployed = false;
    up.buildColliders();
    up.stats = up.vesselStats();
    for (let i = 0; i < 360; i++) {
      down.step(1 / 120, {});
      up.step(1 / 120, {});
    }
    assert.ok(down.telemetry.contacts > 0);
    assert.equal(up.telemetry.contacts, 0, 'no suspension contact for folded gear');
    // Expected from the parts: the fuselage box (tank, 1.25 m across) rests on its flat bottom face.
    const tank = up.parts.find(p => p.type === 'tank'),
      belly = Math.min(
        ...[...up.colliderGroups]
          .filter(([id]) => !isGear(up, id))
          .flatMap(([, group]) => group.map(({collider}) => colliderBottom(collider)))
      );
    assert.ok(Math.abs(tank.p[1] - belly - 0.625) < 1e-6, `fuselage half height ${tank.p[1] - belly}`);
    const tankHeight = f =>
      new T.Vector3(...tank.p)
        .applyQuaternion(new T.Quaternion().copy(f.body.rotation()))
        .add(new T.Vector3().copy(f.body.translation())).y -
      (f.world.ground.translation.y + 1);
    const gearUp = rideHeights(up),
      gearDown = rideHeights(down);
    assert.ok(Math.abs(gearUp.body) < 0.02, `belly on the ground: ${gearUp.body} m`);
    assert.ok(Math.abs(tankHeight(up) - (tank.p[1] - belly)) < 0.02, `ride height ${tankHeight(up)} m`);
    assert.ok(gearUp.gear > 0.2, `folded wheels ${gearUp.gear} m above the ground`);
    assert.ok(gearDown.gear < 0.15 && gearDown.body > 0.5, 'gear down stands on its wheels');
    assert.ok(tankHeight(down) - tankHeight(up) > 0.6, 'well below the wheel height');
    assert.equal(up.crashed, false);
  } finally {
    down.dispose();
    up.dispose();
  }
});

test('a gear-up landing slides on the belly to a stop; a hard one breaks the cockpit', () => {
  const land = (sink, forward) => {
    const f = new Flight(preset('plane'), 'runway');
    f.gearDeployed = false;
    f.buildColliders();
    f.stats = f.vesselStats();
    // From the gear-down height the belly first drops ~0.74 m: about 3.8 m/s more at the touchdown.
    const up = bodyUp(f.pos, f.universalTime);
    f.vel.addScaledVector(up, -sink).addScaledVector(new T.Vector3(0, 0, 1).applyQuaternion(f.q), forward);
    f.sas = false;
    return f;
  };
  const gentle = land(2, 50),
    hard = land(12, 50);
  try {
    let t = 0;
    for (; t < 30 && !(gentle.landed && gentle.telemetry.surfaceSpeed < 0.05); t += 1 / 120)
      gentle.step(1 / 120, {});
    assert.equal(gentle.crashed, false);
    assert.equal(gentle.failureEvents.length, 0, 'nothing breaks');
    assert.equal(gentle.landed, true);
    // Body friction (0.35 on the 0.3 runway) stops 50 m/s in some 15 s, not at once and not rolling on.
    assert.ok(t > 8 && t < 25, `stopped after ${t} s`);
    assert.ok(Math.abs(rideHeights(gentle).body) < 0.02);
    for (let i = 0; i < 240 && !hard.crashed; i++) hard.step(1 / 120, {});
    assert.ok(
      hard.failureEvents.some(e => e.cause === 'impact'),
      'a 12 m/s belly impact still breaks parts'
    );
  } finally {
    gentle.dispose();
    hard.dispose();
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

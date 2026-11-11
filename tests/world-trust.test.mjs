import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '../dist/physics.js';
import {preset} from '../dist/catalog.js';
import {worldFromFlight, flightFromWorld, validateWorld} from '../dist/world-save.js';
import {
  launchWorld,
  selectWorldVessel,
  worldTrackingList,
  retireWorldVessel
} from '../dist/world-operations.js';
import {gameRecord, validateGame} from '../dist/game-save.js';
import {readStoredGame, writeStoredGame, GAME_KEY} from '../dist/game-storage.js';
import {loadFlight} from '../dist/flight-save.js';
import {PracticeSession} from '../dist/practice-session.js';

// One physics world (one Wasm instance) is created per vessel that validation loads.
function loads(run) {
  const Original = RAPIER.World;
  let count = 0;
  RAPIER.World = class extends Original {
    constructor(...args) {
      super(...args);
      count++;
    }
  };
  try {
    run();
  } finally {
    RAPIER.World = Original;
  }
  return count;
}
function threeVessels() {
  let world = worldFromFlight(null, {universalTime: 100});
  for (const [kind, environment] of [
    ['orbiter', 'orbit'],
    ['rover', 'land'],
    ['plane', 'runway']
  ])
    world = launchWorld(world, {parts: preset(kind), environment, name: kind});
  return world;
}
const draft = () => ({name: 'draft', bay: 'vab', environment: 'land', parts: preset('rover')});
function memory() {
  const data = new Map();
  return {data, getItem: k => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v)};
}
// Each returns a world that looks like `world` but cannot be loaded as a flight.
const tampering = {
  'non-finite position': w => (w.vessels[1].pos[1] = NaN),
  'unknown part type': w => (w.vessels[1].parts[0].type = 'no-such-part'),
  'duplicate part id': w => (w.vessels[2].parts[1].id = w.vessels[0].parts[0].id),
  'fuel beyond the tank': w => (w.vessels[0].fuel[0][1] = 1e9),
  'broken quaternion': w => (w.vessels[0].q = [0, 0, 0, 3]),
  'target outside the world': w => (w.vessels[0].targetPartId = 'nobody'),
  'failed part on an intact vessel': w => (w.vessels[1].thermal[0][1].failed = true),
  'fractional stage': w => (w.vessels[1].state.stage = -1.5)
};

test('a world this code built is not loaded again by the next internal step', () => {
  const world = threeVessels(),
    before = structuredClone(world);
  let again;
  assert.equal(
    loads(() => (again = validateWorld(world))),
    0
  );
  assert.deepEqual(again, world, 'the result is what a full validation writes');
  assert.notEqual(again.vessels, world.vessels, 'still an independent copy');
  assert.deepEqual(validateWorld(structuredClone(world)), world, 'and equals the full validation');
  assert.equal(
    loads(() => validateWorld(again)),
    0,
    'the copy it returned is known as well'
  );
  // One load to list (tracking reads live orbits), none to validate.
  assert.equal(
    loads(() => worldTrackingList(world)),
    3
  );
  assert.equal(
    loads(() => selectWorldVessel(world, world.vessels[1].vesselId)),
    0
  );
  const storage = memory();
  assert.equal(
    loads(() => writeStoredGame(storage, gameRecord({world, draft: draft()}))),
    0
  );
  // Launch loads the fleet once to add the vessel and once to validate the world it produced.
  let next;
  assert.equal(
    loads(() => (next = launchWorld(world, {parts: preset('rover'), environment: 'water', name: 'four'}))),
    8
  );
  assert.equal(
    loads(() => validateWorld(next)),
    0,
    'history added by the launch leaves the vessels known'
  );
  assert.deepEqual(world, before, 'inputs are never changed');
});

test('a copy of a known world is validated in full', () => {
  const world = threeVessels();
  for (const copy of [
    structuredClone(world),
    JSON.parse(JSON.stringify(world)),
    {...world, vessels: [...world.vessels]}
  ])
    assert.equal(
      loads(() => validateWorld(copy)),
      3
    );
});

test('changing a known world in place loses the mark, for every kind of damage', () => {
  for (const [name, damage] of Object.entries(tampering)) {
    const world = threeVessels();
    damage(world);
    assert.throws(() => validateWorld(world), name);
    assert.throws(() => flightFromWorld(world), name);
    assert.throws(() => launchWorld(world, {parts: preset('rover'), environment: 'water', name: 'x'}), name);
    assert.throws(() => worldTrackingList(world), name);
    assert.throws(() => selectWorldVessel(world, world.vessels[0].vesselId), name);
    assert.throws(() => retireWorldVessel(world, world.vessels[0].vesselId, 'terminate'), name);
    assert.throws(() => gameRecord({world, draft: draft()}), name);
  }
  // A change that keeps the world valid is loaded again and accepted.
  const world = threeVessels();
  world.vessels[1].state.throttle = 0.25;
  let result;
  assert.equal(
    loads(() => (result = validateWorld(world))),
    3
  );
  assert.equal(result.vessels[1].state.throttle, 0.25);
  // Values JSON cannot tell apart are told apart: null where a number was, NaN, negative zero.
  for (const value of [null, NaN, -0, undefined, Infinity]) {
    const changed = threeVessels();
    changed.vessels[0].pos[0] = 0;
    validateWorld(changed);
    const known = validateWorld(changed);
    known.vessels[0].pos[0] = value;
    let rejected = false;
    const count = loads(() => {
      try {
        validateWorld(known);
      } catch {
        rejected = true;
      }
    });
    assert.ok(rejected || count === 3, 'the full validation decided for ' + String(value));
  }
});

test('a tampered world is rejected on every external entry path', () => {
  const world = threeVessels(),
    good = gameRecord({world, draft: draft()});
  for (const [name, damage] of Object.entries(tampering)) {
    // Storage: the bytes of a save.
    const stored = JSON.parse(JSON.stringify(good));
    damage(stored.world);
    const storage = memory();
    storage.data.set(GAME_KEY, JSON.stringify(stored));
    assert.throws(() => readStoredGame(storage), name);
    // A parsed game or world handed to the validators (import, practice home).
    assert.throws(() => validateGame(stored), name);
    assert.throws(() => validateWorld(stored.world), name);
    assert.throws(
      () => new PracticeSession(stored, {parts: preset('orbiter'), environment: 'orbit', name: 'p'}),
      name
    );
    // Writing never stores it, and leaves the previous save in place.
    const previous = memory();
    writeStoredGame(previous, good);
    const bytes = previous.data.get(GAME_KEY);
    assert.throws(() => writeStoredGame(previous, stored), name);
    assert.equal(previous.data.get(GAME_KEY), bytes);
    // Quick-load: a flight record goes through worldFromFlight and loadFlight.
    const record = flightFromWorld(world);
    damage({vessels: [record, ...record.detached]});
    assert.throws(() => worldFromFlight(record), name);
    assert.throws(() => loadFlight(record), name);
  }
  // The same paths accept the undamaged data, with a full load from storage.
  const storage = memory();
  writeStoredGame(storage, good);
  let read;
  assert.equal(
    loads(() => (read = readStoredGame(storage))),
    3
  );
  assert.deepEqual(read.world, good.world);
});

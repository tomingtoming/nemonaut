import test from 'node:test';
import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';
import {worldFromFlight, flightFromWorld} from '../dist/world-save.js';
import {loadFlight, saveFlight} from '../dist/flight-save.js';
import {setTarget} from '../dist/relative-navigation.js';
import {
  launchWorld,
  selectWorldVessel,
  worldTrackingList,
  retireWorldVessel
} from '../dist/world-operations.js';
import {gameRecord, validateGame} from '../dist/game-save.js';

test('independent world operations preserve satellite A through launch, selection and recovery of B', () => {
  const start = worldFromFlight(null, {universalTime: 5000});
  const a = launchWorld(start, {parts: preset('rocket'), name: 'Satellite A', environment: 'orbit'}),
    aId = a.activeVesselId;
  const before = structuredClone(a),
    b = launchWorld(a, {parts: preset('rover'), name: 'Rover B', environment: 'land'}),
    bId = b.activeVesselId;
  assert.deepEqual(a, before);
  assert.notEqual(aId, bId);
  assert.equal(b.vessels.length, 2);
  let runtime = loadFlight(flightFromWorld(b)),
    world;
  try {
    for (let i = 0; i < 240; i++) runtime.step(1 / 120);
    assert.equal(runtime.landed, true);
    setTarget(runtime, runtime.detached[0], runtime);
    world = worldFromFlight(saveFlight(runtime));
  } finally {
    runtime.dispose();
  }
  const selected = selectWorldVessel(world, aId).world;
  assert.equal(selected.activeVesselId, aId);
  assert.equal(world.activeVesselId, bId);
  const rows = worldTrackingList(selected);
  assert.deepEqual(new Set(rows.map(v => v.id)), new Set([aId, bId]));
  assert.equal(rows.find(v => v.id === bId).recovery.recoverable, true);
  assert.ok(rows.find(v => v.id === bId).surfaceSpeed < 0.1);
  assert.ok(rows.find(v => v.id === bId).speed > 170);
  const selectedCopy = structuredClone(selected),
    result = retireWorldVessel(selected, bId, 'recover');
  assert.deepEqual(selected, selectedCopy);
  assert.equal(result.removed.vesselId, bId);
  assert.equal(result.world.vessels.length, 1);
  assert.equal(result.world.activeVesselId, aId);
  const prior = selected.vessels.find(v => v.vesselId === aId),
    after = result.world.vessels[0];
  for (const key of ['pos', 'vel', 'fuel', 'charge', 'thermal', 'universalTime'])
    assert.deepEqual(after[key], prior[key]);
  assert.equal(after.targetPartId, null);
  const draft = {parts: preset('plane'), name: 'Next plane', bay: 'sph', environment: 'runway'};
  const game = validateGame(JSON.parse(JSON.stringify(gameRecord({world: result.world, draft}))));
  assert.equal(game.world.vessels[0].vesselId, aId);
  assert.deepEqual(game.workshop, draft);
  assert.equal(game.world.universalTime, world.universalTime);
});

test('observation keeps active vessel and failed operations leave world and design unchanged', () => {
  const design = {parts: preset('rocket'), name: 'A', environment: 'orbit'};
  let world = launchWorld(worldFromFlight(null), design);
  world = launchWorld(world, design);
  const copy = structuredClone(world),
    draft = structuredClone(design),
    other = world.vessels.find(v => v.vesselId !== world.activeVesselId).vesselId;
  const observed = selectWorldVessel(world, other, {observe: true});
  assert.equal(observed.world.activeVesselId, world.activeVesselId);
  assert.equal(observed.observe, other);
  for (const action of [
    () => selectWorldVessel(world, 'missing'),
    () => retireWorldVessel(world, other, 'recover'),
    () => launchWorld(world, {...design, universalTime: 123}),
    () => launchWorld(world, {...design, environment: 'bad'})
  ])
    assert.throws(action);
  assert.deepEqual(world, copy);
  assert.deepEqual(design, draft);
  world.vessels.find(v => v.vesselId === other).state.crashed = true;
  assert.throws(() => selectWorldVessel(world, other));
  assert.equal(selectWorldVessel(world, other, {observe: true}).observe, other);
});

test('retiring final vessel keeps epoch, and next launch starts in the same empty world', () => {
  const world = launchWorld(worldFromFlight(null, {universalTime: 7000}), {
    parts: preset('rocket'),
    name: 'A',
    environment: 'orbit'
  });
  const result = retireWorldVessel(world, world.activeVesselId, 'terminate');
  assert.equal(result.world.universalTime, 7000);
  assert.equal(result.world.activeVesselId, null);
  assert.deepEqual(worldTrackingList(result.world), []);
  const next = launchWorld(result.world, {parts: preset('rocket'), name: 'B', environment: 'land'});
  assert.equal(next.universalTime, 7000);
  assert.equal(next.vessels.length, 1);
  assert.notEqual(next.activeVesselId, world.activeVesselId);
});

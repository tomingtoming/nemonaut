import test from 'node:test';
import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';
import {createFuel, fuelNetworks, engineBurn} from '../dist/resources.js';
import {stageFuelLevels} from '../dist/stage-fuel.js';
test('Stage gauges count shared tanks once and track only the burning fuel network', () => {
  const parts = preset('launcher'),
    fuel = createFuel(parts),
    networks = fuelNetworks(parts),
    before = stageFuelLevels(parts, fuel),
    booster = networks.network.get(parts[8].id);
  assert.equal(before.get(0).engines.length, 4);
  assert.equal(before.get(0).capacity, 5400);
  assert.equal(before.get(1).remaining, 3600);
  const thrust = engineBurn(networks, fuel, new Set(booster.engines.map(p => p.id)), 1, 1.225, 10),
    after = stageFuelLevels(parts, fuel);
  assert.ok([...thrust.values()].every(x => x > 0));
  assert.ok(after.get(0).remaining < 5400);
  assert.equal(after.get(1).remaining, 3600);
  assert.equal(after.get(0).capacity, 5400);
  for (const tank of booster.tanks) fuel.set(tank.id, 0);
  assert.equal(stageFuelLevels(parts, fuel).get(0).unfed, 4);
  assert.equal(stageFuelLevels(parts, fuel).get(1).unfed, 0);
});
test('An isolated engine is reported as unfed even beside another supplied engine in its stage', () => {
  const parts = preset('launcher');
  parts.push({id: 'isolated', type: 'engine', parent: null, stage: 0, p: [0, 0, 0], r: [0, 0, 0]});
  const levels = stageFuelLevels(parts);
  assert.equal(levels.get(0).capacity, 5400);
  assert.equal(levels.get(0).unfed, 1);
  assert.equal(levels.get(0).engines.length, 5);
});

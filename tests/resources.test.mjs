import test from 'node:test';
import assert from 'node:assert/strict';
import {PARTS, preset} from '../dist/catalog.js';
import {Flight, validateCraft} from '../dist/core.js';
import {createFuel, fuelNetworks, engineBurn} from '../dist/resources.js';
test('Booster burn preserves upper-stage fuel and separation preserves surviving tanks', () => {
  const parts = preset('launcher');
  validateCraft({version: 1, parts});
  const f = new Flight(parts, 'land'),
    upper = f.networks.network.get(parts[3].id).tanks.map(p => p.id);
  f.stageNext();
  f.throttle = 1;
  for (let i = 0; i < 1200; i++) f.step(1 / 120);
  for (const id of upper) assert.equal(f.fuel.get(id), 1800);
  assert.ok(f.fuelRatio < 1);
  f.stageNext();
  assert.equal(f.parts.length, 4);
  assert.equal(f.active.size, 1);
  for (const id of upper) assert.equal(f.fuel.get(id), 1800);
  for (let i = 0; i < 120; i++) f.step(1 / 120);
  assert.ok(f.fuel.get(upper[0]) < 1800);
  assert.ok(f.lastThrust > 44000);
  f.dispose();
});
test('Engines share finite propellant without order bias or overdraw', () => {
  const p = preset('launcher'),
    fuel = createFuel(p),
    n = fuelNetworks(p),
    g = n.network.get(p[8].id);
  for (const tank of g.tanks) fuel.set(tank.id, 0.01);
  const thrust = engineBurn(n, fuel, new Set(g.engines.map(e => e.id)), 1, 1.225, 1),
    used = [...thrust].reduce(
      (sum, [id, f]) => sum + f / (PARTS[p.find(x => x.id === id).type].isp * 9.81),
      0
    );
  assert.ok(Math.abs(used - 0.03) < 1e-12);
  const values = g.engines.map(e => thrust.get(e.id));
  assert.ok(values.every(v => v === values[0]));
  assert.ok(g.tanks.every(t => fuel.get(t.id) === 0));
});
import {stagePerformance} from '../dist/resources.js';
test('Reference performance excludes dormant engines and discards booster dry mass', () => {
  const plan = stagePerformance(preset('launcher'));
  assert.equal(plan.length, 2);
  assert.equal(plan[0].thrust, 180000);
  assert.equal(plan[1].thrust, 45000);
  assert.equal(plan[1].mass, 4790);
  assert.ok(plan[0].twr > 1.5 && plan[0].twr < 1.6);
  assert.ok(plan[0].dv + plan[1].dv > 5800);
});
test('An engine cannot draw from a tank across a separator, even if both are still attached', () => {
  const p = preset('launcher'),
    f = new Flight(p, 'orbit'),
    g = f.networks.network.get(p[8].id);
  for (const tank of g.tanks) f.fuel.set(tank.id, 0);
  f.stageNext();
  f.throttle = 1;
  f.step(1 / 120);
  assert.equal(f.lastThrust, 0);
  assert.equal(f.fuel.get(p[1].id), 1800);
  assert.equal(f.fuel.get(p[2].id), 1800);
  assert.ok([...f.engineThrust.values()].every(v => v === 0));
  f.dispose();
});

test('Reference performance excludes fuel-starved clusters from thrust and Isp', () => {
  const p = preset('launcher'),
    baseline = stagePerformance(p);
  const root = p.find(x => !x.parent);
  const separator = {
    id: 'isolator',
    type: 'decoupler',
    parent: root.id,
    stage: 9,
    p: [0, 0, 0],
    r: [0, 0, 0]
  };
  const engine = {
    id: 'dry-engine',
    type: 'engine',
    parent: separator.id,
    stage: 0,
    p: [0, 0, 0],
    r: [0, 0, 0]
  };
  const plan = stagePerformance([...p, separator, engine]);
  assert.equal(plan[0].thrust, baseline[0].thrust);
  assert.ok(plan[0].twr < baseline[0].twr, 'dry hardware adds mass, never thrust');
  assert.ok(plan[0].dv < baseline[0].dv, 'dry hardware reduces delta-v');
  const dry = createFuel(p);
  for (const id of dry.keys()) dry.set(id, 0);
  assert.deepEqual(stagePerformance(p, dry), [], 'empty craft has no reference burns');
});

import {stageFuelLevels} from '../dist/stage-fuel.js';

test('Explicit thrust media preserve every engine burn and fuel gauge without legacy flags', () => {
  for (const [type, definition] of Object.entries(PARTS).filter(([, d]) => d.thrust > 0)) {
    const saved = PARTS[type];
    const {air, water, ...withoutFlags} = saved;
    const parts = [
      {id: 'supply', type: 'tank', stage: 0},
      {id: 'motor', type, parent: 'supply', stage: 0}
    ];
    try {
      PARTS[type] = withoutFlags;
      const network = fuelNetworks(parts);
      assert.equal(network.network.get('motor').engines.length, water ? 0 : 1, type);
      assert.equal(stageFuelLevels(parts).size, water ? 0 : 1, type);
      assert.equal(stagePerformance(parts).length, water ? 0 : 1, type);
      for (const density of [0, 0.6125, 1.225]) {
        const fuel = createFuel(parts);
        const before = fuel.get('supply');
        const pressure = (density / 1.225) * 101325;
        const isp =
          saved.ispSeaLevel === undefined
            ? saved.isp
            : saved.isp + ((saved.ispSeaLevel - saved.isp) * pressure) / 101325;
        const expected = water ? 0 : saved.thrust * 0.5 * (air ? density / 1.225 : isp / saved.isp);
        const actual = engineBurn(network, fuel, new Set(['motor']), 0.5, density, 0.01);
        assert.ok(Math.abs((actual.get('motor') || 0) - expected) < 1e-8, `${type} at ${density}`);
        assert.ok(Math.abs(before - fuel.get('supply') - (expected * 0.01) / (isp * 9.81)) < 1e-9, type);
      }
    } finally {
      PARTS[type] = saved;
    }
  }
});

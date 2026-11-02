import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PARTS, part, preset, nodes} from '../dist/catalog.js';
import {engineBurn, engineIsp, createFuel, fuelNetworks, stagePerformance} from '../dist/resources.js';
import {Flight, validateCraft} from '../dist/core.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {atmosphere} from '../dist/planet.js';
import {bodyAltitude, referenceBody} from '../dist/celestial.js';
const types = Object.keys(PARTS).filter(k => PARTS[k].ispSeaLevel);
test('six sized engines trade sea-level thrust for vacuum Isp without changing mass flow', () => {
  assert.equal(types.length, 6);
  for (const type of types) {
    const tank = part('tankLarge'),
      engine = part(type, [0, -3, 0], [0, 0, 0], tank.id),
      parts = [tank, engine],
      network = fuelNetworks(parts),
      d = PARTS[type];
    let usedVac;
    for (const pressure of [0, 50662.5, 101325]) {
      const fuel = createFuel(parts),
        force = engineBurn(network, fuel, new Set([engine.id]), 0.4, 1.225, 1, pressure).get(engine.id),
        used = (d.thrust * 0.4) / (d.isp * 9.81);
      assert.ok(Math.abs(force - (d.thrust * 0.4 * engineIsp(engine, pressure)) / d.isp) < 1e-7);
      assert.ok(Math.abs(14400 - fuel.get(tank.id) - used) < 1e-9);
      usedVac = used;
    }
    const fuel = new Map([[tank.id, 0.001]]),
      force = engineBurn(network, fuel, new Set([engine.id]), 1, 1.225, 1, 101325).get(engine.id);
    assert.equal(fuel.get(tank.id), 0);
    assert.ok(Math.abs(force - 0.001 * d.ispSeaLevel * 9.81) < 1e-9);
    assert.ok(usedVac > 0);
  }
});
test('new engine exports contain a distinct animated nozzle', async () => {
  for (const type of types) {
    const data = await readFile(new URL('../dist/assets/parts/' + type + '.glb', import.meta.url)),
      gltf = await new GLTFLoader().parseAsync(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        ''
      );
    assert.ok(gltf.scene.getObjectByName('GimbalNozzle'), type);
    assert.ok(gltf.scene.getObjectByName('EngineMount'), type);
  }
});
test('flight uses atmospheric pressure for new engines and applies gimbal commands', () => {
  for (const type of types) {
    const core = part('probe'),
      tank = part('tankLarge', [0, -2.2, 0], [0, 0, 0], core.id),
      engine = part(type, [0, -5.7, 0], [0, 0, 0], tank.id);
    const f = new Flight([core, tank, engine], 'land');
    try {
      assert.equal(f.rocketAxes, true);
      f.stageNext();
      f.throttle = 0.2;
      const pressure = atmosphere(bodyAltitude(f.pos, 0, referenceBody(f.pos, 0))).pressure;
      f.step(1 / 120, {pitch: 1});
      assert.ok(
        Math.abs(
          f.engineThrust.get(engine.id) -
            (PARTS[type].thrust * 0.2 * engineIsp(engine, pressure)) / PARTS[type].isp
        ) < 1e-6
      );
      assert.ok(f.gimbals.get(engine.id).length() > 0);
    } finally {
      f.dispose();
    }
  }
});
test('adapters pass fuel, matching separators isolate fuel, and axial sockets meet', () => {
  for (const [tankType, adapterType, decType, engineType] of [
    ['tankSmall', 'adapterSmall', 'decouplerSmall', 'engineSeaSmall'],
    ['tankLarge', 'adapterLarge', 'decouplerLarge', 'engineSeaLarge']
  ]) {
    const tank = part(tankType),
      adapter = part(adapterType, [0, 0, 0], [0, 0, 0], tank.id),
      engine = part(engineType, [0, 0, 0], [0, 0, 0], adapter.id),
      parts = [tank, adapter, engine];
    assert.equal(fuelNetworks(parts).network.get(engine.id).tanks[0].id, tank.id);
    adapter.type = decType;
    assert.equal(fuelNetworks(parts).network.get(engine.id).tanks.length, 0);
  }
  const a = preset('atlas');
  validateCraft({version: 1, parts: a});
  for (const p of a.filter(p => p.parent && p.type !== 'solar')) {
    const parent = a.find(x => x.id === p.parent);
    assert.ok(
      Math.abs(p.p[1] + nodes(p.type)[0][1] - parent.p[1] - nodes(parent.type)[1][1]) < 1e-10,
      p.type
    );
  }
  const plan = stagePerformance(a);
  assert.equal(plan.length, 2);
  assert.ok(plan[0].seaTwr > 1.4);
  assert.ok(plan[1].seaTwr < plan[1].twr * 0.4);
});
test('large sea-level booster launches, retains the vacuum stage fuel and saves new parts', () => {
  const f = new Flight(preset('atlas'), 'land');
  let loaded;
  try {
    assert.equal(f.rocketAxes, true);
    f.stageNext();
    f.throttle = 1;
    for (let i = 0; i < 120 * 15; i++) f.step(1 / 120);
    assert.equal(f.crashed, false);
    assert.ok(f.orbit.altitude > 200);
    const upper = f.parts.filter(p => p.type === 'tank');
    assert.ok(upper.every(p => f.fuel.get(p.id) === 1800));
    f.stageNext();
    assert.ok(f.parts.some(p => p.type === 'engineVacMedium'));
    assert.ok(!f.parts.some(p => p.type === 'tankLarge'));
    loaded = loadFlight(saveFlight(f));
    assert.equal(loaded.parts.length, f.parts.length);
    assert.equal(loaded.rocketAxes, true);
  } finally {
    f.dispose();
    loaded?.dispose();
  }
});

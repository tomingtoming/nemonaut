import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight, validateCraft} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {partActions, setPartAction} from '../dist/part-actions.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
const run = (f, input = {}) => {
  for (let i = 0; i < 60; i++) f.step(1 / 120, input);
};
test('Part engine switch fires only its own engine, cuts thrust, and survives save/restore', () => {
  const f = new Flight(preset('launcher'), 'orbit');
  try {
    const engines = f.parts.filter(p => PARTS[p.type].thrust),
      id = engines[0].id;
    f.sas = false;
    f.throttle = 0.2;
    assert.ok(setPartAction(f, id, 'engine', true));
    run(f);
    assert.ok(f.engineThrust.get(id) > 0);
    assert.equal([...f.engineThrust].filter(([, n]) => n > 0).length, 1);
    assert.equal(f.stage, -1);
    assert.ok(setPartAction(f, id, 'engine', false));
    run(f);
    assert.equal(f.lastThrust, 0);
    const g = loadFlight(saveFlight(f));
    assert.equal(g.active.has(id), false);
    g.dispose();
  } finally {
    f.dispose();
  }
});
test('Disabled fin and gimbal return to neutral under continued pilot input, settings persist', () => {
  const f = new Flight(preset('rocket'), 'orbit');
  try {
    f.sas = false;
    const fin = f.parts.find(p => PARTS[p.type].controlAxis),
      engine = f.parts.find(p => PARTS[p.type].gimbal);
    run(f, {pitch: 1, yaw: 1, roll: 1});
    assert.ok([...f.deflections.values()].some(a => Math.abs(a) > 0.01));
    assert.ok(f.gimbals.get(engine.id).length() > 0.01);
    setPartAction(f, fin.id, 'controlEnabled', false);
    setPartAction(f, engine.id, 'gimbalEnabled', false);
    run(f, {pitch: 1, yaw: 1, roll: 1});
    assert.equal(f.deflections.get(fin.id), 0);
    assert.equal(f.gimbals.get(engine.id).length(), 0);
    const g = loadFlight(saveFlight(f));
    assert.equal(g.parts.find(p => p.id === fin.id).controlEnabled, false);
    assert.equal(g.parts.find(p => p.id === engine.id).gimbalEnabled, false);
    g.dispose();
    const bad = structuredClone(f.parts);
    bad[0].controlEnabled = 'false';
    assert.throws(() => validateCraft({version: 1, parts: bad}));
  } finally {
    f.dispose();
  }
});
test('Actions cannot target absent equipment, missing parts or an uncontrollable vessel', () => {
  const f = new Flight(preset('rover'), 'land');
  try {
    const wheel = f.parts.find(p => p.type === 'wheel'),
      core = f.parts.find(p => PARTS[p.type].control);
    assert.ok(setPartAction(f, wheel.id, 'driveEnabled', false));
    assert.ok(
      f.parts.filter(p => p.type === 'wheel' && p.id !== wheel.id).every(p => p.driveEnabled !== false)
    );
    assert.equal(setPartAction(f, wheel.id, 'reactionEnabled', false), false);
    assert.equal(setPartAction(f, 'missing', 'engine', true), false);
    f.reactionEnabled = false;
    assert.equal(partActions(f, core.id).find(a => a.key === 'reactionEnabled').globalOff, true);
    f.crashed = true;
    assert.equal(setPartAction(f, wheel.id, 'driveEnabled', true), false);
  } finally {
    f.dispose();
  }
});
import {engineState} from '../dist/part-actions.js';
test('Engine window distinguishes shutdown, idle, thrust limit, fuel isolation and restarted burn', () => {
  const f = new Flight(preset('launcher'), 'orbit');
  let saved;
  try {
    const engine = f.parts.find(p => p.type === 'engine'),
      id = engine.id,
      tanks = f.networks.network.get(id).tanks;
    assert.equal(engineState(f, id).status, '停止中');
    assert.equal(engineState(f, f.parts[0].id), null);
    setPartAction(f, id, 'engine', true);
    assert.equal(engineState(f, id).status, 'スロットル待ち');
    assert.equal(f.stage, -1);
    f.throttle = 0.3;
    engine.thrustLimit = 0;
    assert.equal(engineState(f, id).status, '推力上限 0%');
    engine.thrustLimit = 1;
    for (const tank of tanks) setPartAction(f, tank.id, 'fuelEnabled', false);
    run(f);
    assert.equal(engineState(f, id).status, '燃料供給なし');
    assert.equal(f.lastThrust, 0);
    for (const tank of tanks) setPartAction(f, tank.id, 'fuelEnabled', true);
    run(f);
    assert.equal(engineState(f, id).status, '燃焼中');
    assert.ok(f.lastThrust > 0);
    setPartAction(f, id, 'engine', false);
    run(f);
    assert.equal(f.lastThrust, 0);
    assert.equal(f.throttle, 0.3);
    setPartAction(f, id, 'engine', true);
    run(f);
    assert.ok(f.lastThrust > 0);
    assert.equal(f.active.size, 1);
    assert.equal(f.stage, -1);
    saved = loadFlight(saveFlight(f));
    assert.ok(saved.active.has(id));
    assert.equal(saved.throttle, 0.3);
    f.thermal.get(id).failed = true;
    assert.equal(engineState(f, id).status, '損傷');
    assert.ok(engineState(f, id).enabled);
    assert.equal(setPartAction(f, id, 'engine', false), true);
    assert.equal(engineState(f, id).enabled, false);
    assert.equal(setPartAction(f, id, 'engine', true), false);
  } finally {
    saved?.dispose();
    f.dispose();
  }
});

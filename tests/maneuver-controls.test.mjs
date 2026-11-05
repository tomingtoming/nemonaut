import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {PARTS, preset} from '../dist/catalog.js';
import {maneuverBurnAvailable, recoveryGuidance} from '../dist/maneuver-controls.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';

test('Guided burns require ignition, connected fuel and a live controllable vessel', () => {
  const f = new Flight(preset('lunar-return'), 'moon-orbit');
  try {
    f.step(1 / 120);
    f.maneuver = {returnPlan: {}, complete: false};
    assert.equal(maneuverBurnAvailable(f, 'returnPlan'), false);
    f.stageNext();
    assert.equal(maneuverBurnAvailable(f, 'returnPlan'), true);
    const fuel = new Map(f.fuel);
    for (const id of f.fuel.keys()) f.fuel.set(id, 0);
    assert.equal(maneuverBurnAvailable(f, 'returnPlan'), false);
    f.fuel = fuel;
    f.crashed = true;
    assert.equal(maneuverBurnAvailable(f, 'returnPlan'), false);
    f.crashed = false;
    f.stageNext();
    assert.equal(maneuverBurnAvailable(f, 'returnPlan'), false);
    assert.equal(maneuverBurnAvailable(f.detached[0], 'returnPlan'), false);
  } finally {
    f.dispose();
  }
});

test('Recovery guidance follows separation, arming, deployment and damage across restore', () => {
  const f = new Flight(preset('lunar-return'), 'moon-orbit');
  try {
    assert.match(recoveryGuidance(f), /推進部が残って/);
    f.stageNext();
    f.stageNext();
    assert.match(recoveryGuidance(f), /Hで/);
    f.stageNext();
    assert.match(recoveryGuidance(f), /安全条件待ち/);
    const chute = [...f.chutes.values()][0];
    chute.status = 'reefed';
    assert.match(recoveryGuidance(f), /縮帆/);
    chute.status = 'open';
    chute.fraction = 1;
    assert.match(recoveryGuidance(f), /全開/);
    const restored = loadFlight(saveFlight(f));
    try {
      assert.equal(recoveryGuidance(restored), recoveryGuidance(f));
    } finally {
      restored.dispose();
    }
    f.step(1 / 120);
    f.landed = true;
    assert.match(recoveryGuidance(f), /母星へ帰還後/);
    assert.match(recoveryGuidance(f, {practice: true}), /練習は回収・実績の対象外/);
    f.orbit.bodyId = 'planet';
    assert.match(recoveryGuidance(f), /追跡施設から回収できます/);
    assert.match(recoveryGuidance(f, {practice: true}), /通常世界へ戻れます/);
    f.crashed = true;
    assert.match(recoveryGuidance(f), /損傷/);
  } finally {
    f.dispose();
  }
  const bare = new Flight(preset('recovery'), 'drop');
  try {
    assert.match(recoveryGuidance(bare), /熱シールドがありません/);
  } finally {
    bare.dispose();
  }
});

test('Completed plans and plans belonging to another body cannot restart a guided burn', () => {
  for (const [kind, environment] of [
    ['departure', 'orbit'],
    ['capture', 'moon-orbit'],
    ['returnPlan', 'moon-orbit']
  ]) {
    const f = new Flight(preset('lunar-return'), environment);
    try {
      f.stageNext();
      f.step(1 / 120);
      f.maneuver = {[kind]: {}, complete: false};
      const before = [...f.fuel];
      assert.equal(maneuverBurnAvailable(f, kind), true);
      assert.deepEqual([...f.fuel], before);
      f.maneuver.complete = true;
      assert.equal(maneuverBurnAvailable(f, kind), false);
      f.maneuver.complete = false;
      f.orbit.bodyId = environment === 'orbit' ? 'moon' : 'planet';
      assert.equal(maneuverBurnAvailable(f, kind), false);
      f.maneuver = null;
      assert.equal(maneuverBurnAvailable(f, kind), false);
    } finally {
      f.dispose();
    }
  }
});

test('guided burns require declared medium independence even when legacy flags are absent', () => {
  const f = new Flight(preset('lunar-return'), 'moon-orbit');
  const originals = new Map();
  try {
    f.step(1 / 120);
    f.maneuver = {returnPlan: {}, complete: false};
    f.stageNext();
    assert.equal(maneuverBurnAvailable(f, 'returnPlan'), true);
    for (const p of f.parts) {
      if (!PARTS[p.type].thrust || originals.has(p.type)) continue;
      originals.set(p.type, PARTS[p.type]);
      PARTS[p.type] = {...PARTS[p.type], thrustMedium: undefined};
    }
    assert.equal(maneuverBurnAvailable(f, 'returnPlan'), false);
    for (const [type, original] of originals) PARTS[type] = {...original, thrustMedium: 'water'};
    assert.equal(maneuverBurnAvailable(f, 'returnPlan'), false);
    for (const [type, original] of originals) PARTS[type] = original;
    assert.equal(maneuverBurnAvailable(f, 'returnPlan'), true);
  } finally {
    for (const [type, original] of originals) PARTS[type] = original;
    f.dispose();
  }
});

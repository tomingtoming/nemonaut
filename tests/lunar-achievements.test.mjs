import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {preset, part} from '../dist/catalog.js';
import {launchWorld} from '../dist/world-operations.js';
import {worldFromFlight, flightFromWorld} from '../dist/world-save.js';
import {loadFlight} from '../dist/flight-save.js';
import {MOON, bodyState} from '../dist/celestial.js';
import {recordLunarAchievements} from '../dist/lunar-achievements.js';
import {validateHistory, appendHistory} from '../dist/world-history.js';
import {dockVessels, undockVessel} from '../dist/docking.js';

// Controlled fixtures verify achievement rules, not an end-to-end lunar mission.
test('lunar records require surface lineage and real geometry, survive reload and do not repeat', () => {
  const world = launchWorld(worldFromFlight(null), {
    parts: preset('lander'),
    name: 'Lander',
    environment: 'land'
  });
  const f = loadFlight(flightFromWorld(world));
  try {
    f.time = 1;
    f.universalTime = 1;
    f.orbit = {bodyId: 'moon'};
    assert.equal(recordLunarAchievements(world.history, f), world.history, 'stale HUD cannot prove arrival');
    const moon = bodyState(MOON, 1);
    f.pos.copy(moon.position).add(new T.Vector3(0, MOON.radius + 20000, 0));
    f.vel.copy(moon.velocity);
    f.landed = true;
    const arrived = recordLunarAchievements(world.history, f);
    assert.deepEqual(
      arrived.map(e => e.type),
      ['launch', 'moon-arrival'],
      'landed flag at altitude cannot prove landing'
    );
    assert.equal(recordLunarAchievements(arrived, f), arrived);
    assert.equal(recordLunarAchievements(world.history, f, {practice: true}), world.history);
    assert.deepEqual(recordLunarAchievements([], f), []);
    const placed = structuredClone(world.history);
    placed[0].environment = 'moon-orbit';
    assert.equal(recordLunarAchievements(placed, f), placed);
    f.q.identity();
    f.pos.copy(moon.position).add(new T.Vector3(0, MOON.radius + 2.2, 0));
    f.sasMode = 'radial';
    for (let i = 0; i < 1200; i++) f.step(1 / 120);
    assert.equal(f.crashed, false);
    assert.equal(f.landed, true);
    const landed = recordLunarAchievements(arrived, f);
    assert.deepEqual(
      landed.map(e => e.type),
      ['launch', 'moon-arrival', 'moon-landing']
    );
    assert.deepEqual(validateHistory(JSON.parse(JSON.stringify(landed)), f.universalTime), landed);
    assert.equal(recordLunarAchievements(landed, f), landed);
    for (const mutate of [
      h => h.splice(1, 1),
      h => (h[1].bodyId = 'planet'),
      h => (h[1].launchEventIds = ['unknown']),
      h => (h[0].environment = 'moon-surface'),
      h => h.push({...h[2], id: crypto.randomUUID()}),
      h => (h[2].partIds[0] = 'unlaunched')
    ]) {
      const bad = structuredClone(landed);
      mutate(bad);
      assert.throws(() => validateHistory(bad, f.universalTime));
    }
    f.crashed = true;
    assert.equal(recordLunarAchievements(world.history, f), world.history);
  } finally {
    f.dispose();
  }
});

test('lunar provenance follows real docking and undocking; new parts cannot borrow a prior arrival', () => {
  const craft = () => {
    const core = part('probe');
    return [core, part('dockingPort', [0, 0.321, 0], [0, 0, 0], core.id)];
  };
  for (const environment of ['land', 'orbit']) {
    let world = launchWorld(worldFromFlight(null), {parts: craft(), name: 'A', environment: 'land'});
    // The provenance fixture clears A from the departure envelope before adding B.
    world.vessels[0].pos[0] += 100;
    world = launchWorld(world, {parts: craft(), name: 'B', environment});
    let f = loadFlight(flightFromWorld(world));
    try {
      const a = f.detached[0],
        b = f,
        moon = bodyState(MOON, 1);
      for (const v of [a, b]) {
        v.universalTime = 1;
        v.time = 1;
        v.landed = false;
        v.vel.copy(moon.velocity);
        v.omega.set(0, 0, 0);
      }
      a.pos.copy(moon.position).add(new T.Vector3(0, MOON.radius + 20000, 0));
      // A is the only observed arrival before B joins it.
      let history = recordLunarAchievements(world.history, a);
      assert.equal(history.at(-1).name, 'A');
      a.q.identity();
      b.q.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI);
      b.pos.copy(a.pos).add(new T.Vector3(0, 0.884, 0));
      const ap = a.parts.find(p => p.type === 'dockingPort'),
        bp = b.parts.find(p => p.type === 'dockingPort');
      f = dockVessels(f, a, bp.id, ap.id);
      const combined = recordLunarAchievements(history, f);
      if (environment === 'land') assert.equal(combined.length, history.length + 1);
      else assert.equal(combined, history, 'practice additions disqualify the combined craft');
      const recovered = appendHistory(
        {history: combined, universalTime: 1},
        'recover',
        {...f, state: {time: 1}},
        {bodyId: 'planet'}
      ).at(-1);
      assert.equal(!!recovered.moonEventIds, environment === 'land');
      f = undockVessel(f, bp.id);
      history = recordLunarAchievements(combined, f);
      validateHistory(history, 1);
      const originalA = [f, ...f.detached].find(v => v.parts.some(p => p.id === ap.id));
      const returnA = appendHistory(
        {history, universalTime: 1},
        'recover',
        {...originalA, state: {time: 1}},
        {bodyId: 'planet'}
      );
      assert.ok(returnA.at(-1).moonEventIds.length);
      const bad = structuredClone(returnA);
      bad.at(-1).moonEventIds = ['unknown'];
      assert.throws(() => validateHistory(bad, 1));
      const wrongBody = structuredClone(returnA);
      wrongBody.at(-1).bodyId = 'moon';
      assert.throws(() => validateHistory(wrongBody, 1));
    } finally {
      f.dispose();
    }
  }
});

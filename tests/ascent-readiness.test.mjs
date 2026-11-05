import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {saveFlight} from '../dist/flight-save.js';
import {ascentReadiness} from '../tools/ascent-readiness.mjs';
import {AscentSession} from '../tools/ascent-session.mjs';
for (const kind of ['launcher', 'atlas'])
  test(`preflight accepts ${kind} without consuming fuel or executing real stages`, () => {
    const f = new Flight(preset(kind), 'land');
    try {
      const before = saveFlight(f);
      assert.equal(ascentReadiness(f), null);
      assert.deepEqual(saveFlight(f), before);
    } finally {
      f.dispose();
    }
  });
for (const [label, change, reason] of [
  [
    'empty tanks',
    f => {
      for (const id of f.fuel.keys()) f.fuel.set(id, 0);
    },
    /燃料/
  ],
  [
    'low thrust',
    f => {
      for (const p of f.parts) if (PARTS[p.type].thrust) p.thrustLimit = 0.01;
    },
    /重量/
  ],
  ['lying down', f => f.q.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2), /直立/],
  ['moving', f => (f.vel.z += 10), /静止/],
  [
    'no attitude actuators',
    f => {
      f.reactionEnabled = false;
      for (const p of f.parts) p.gimbalEnabled = false;
    },
    /姿勢制御/
  ]
])
  test(`preflight rejects ${label} atomically`, () => {
    const f = new Flight(preset('launcher'), 'land'),
      s = new AscentSession();
    try {
      change(f);
      const before = saveFlight(f);
      assert.match(ascentReadiness(f), reason);
      assert.throws(() => s.start(f, {altitude: 120000}), reason);
      assert.equal(s.owner, null);
      assert.deepEqual(saveFlight(f), before);
    } finally {
      f.dispose();
    }
  });
test('preflight traverses empty initial slots without staging the original', () => {
  const parts = preset('launcher');
  for (const p of parts) if (PARTS[p.type].thrust || PARTS[p.type].decoupler) p.stage = p.stage === 0 ? 2 : 5;
  const f = new Flight(parts, 'land');
  try {
    const before = saveFlight(f);
    assert.equal(ascentReadiness(f), null);
    assert.deepEqual(saveFlight(f), before);
  } finally {
    f.dispose();
  }
});
test('Atlas at 60 percent cannot lift immediately even though burning on the pad eventually lightens it', () => {
  const parts = preset('atlas');
  for (const p of parts) if (PARTS[p.type].thrust) p.thrustLimit = 0.6;
  const f = new Flight(parts, 'land');
  try {
    assert.match(ascentReadiness(f), /重量/);
    assert.equal(f.started, false);
    assert.equal(f.stage, -1);
  } finally {
    f.dispose();
  }
});

test('launch readiness compares the combined engine axis with the gravity-turn axis', () => {
  for (const symmetric of [false, true]) {
    const parts = preset('launcher');
    const first = Math.min(...parts.filter(p => PARTS[p.type].thrust).map(p => p.stage));
    for (const p of parts.filter(p => PARTS[p.type].thrust && p.stage === first)) {
      p.r = [0, 0, Math.PI / 8];
      if (symmetric) parts.push({...structuredClone(p), id: p.id + '-mirror', r: [0, 0, -Math.PI / 8]});
    }
    const f = new Flight(parts, 'land');
    try {
      const before = saveFlight(f);
      if (symmetric) assert.equal(ascentReadiness(f), null);
      else assert.match(ascentReadiness(f), /推力軸/);
      assert.deepEqual(saveFlight(f), before);
    } finally {
      f.dispose();
    }
  }
});

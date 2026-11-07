import {convertSavedPartFrame} from '../dist/part-save-frame.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {saveFlight} from '../dist/flight-save.js';
import {workspaceRecord} from '../dist/workspace-save.js';
import {editingParts, migrateWorkspace, validateGame} from '../dist/game-save.js';

test('whole-game migration separates editable design from persistent world without changing the source', () => {
  const f = new Flight(preset('twin'), 'orbit', 5000);
  try {
    f.stageNext();
    f.stageNext();
    f.step(1 / 120);
    const legacy = workspaceRecord({
        parts: preset('plane'),
        name: 'Next plane',
        bay: 'sph',
        environment: 'runway',
        flight: saveFlight(f)
      }),
      before = structuredClone(legacy);
    const game = migrateWorkspace(legacy),
      restored = validateGame(JSON.parse(JSON.stringify(game)));
    assert.equal(restored.world.vessels.length, 2);
    assert.equal(restored.world.universalTime, f.universalTime);
    assert.deepEqual(editingParts(restored), convertSavedPartFrame(legacy.parts, 'encode'));
    assert.deepEqual(legacy, before);
    const world = structuredClone(restored.world);
    restored.workshop.parts[0].p[0] += 10;
    assert.deepEqual(restored.world, world);
    assert.deepEqual(legacy, before);
    assert.deepEqual(
      restored.world.vessels.map(v => v.vesselId),
      game.world.vessels.map(v => v.vesselId)
    );
  } finally {
    f.dispose();
  }
});

test('empty worlds and empty drafts remain valid independently; invalid saves fail atomically', () => {
  const legacy = workspaceRecord({
    parts: [],
    name: 'Empty',
    bay: 'vab',
    environment: 'land',
    universalTime: 6000
  });
  const game = migrateWorkspace(legacy);
  assert.equal(game.world.universalTime, 6000);
  assert.deepEqual(game.world.vessels, []);
  assert.deepEqual(game.workshop.parts, []);
  for (const mutate of [
    s => (s.world.universalTime = -1),
    s => (s.world.activeVesselId = 'missing'),
    s => (s.workshop.bay = 'unknown'),
    s => (s.workshop.parts = [{}]),
    s => (s.version = 3)
  ]) {
    const bad = structuredClone(game);
    mutate(bad);
    const copy = structuredClone(bad);
    assert.throws(() => validateGame(bad));
    assert.deepEqual(bad, copy);
  }
});

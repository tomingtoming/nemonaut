// Run with node --import ./tools/thermal-shadow-preload.mjs tools/thermal-lifecycle.mjs
import assert from 'node:assert/strict';
import {thermalCounts} from './thermal-shadow-preload.mjs';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';

const f = new Flight(preset('returner'), 'orbit');
let restored;
function measure(label, flight, ticks) {
  const before = thermalCounts();
  for (let i = 0; i < ticks; i++) flight.step(1 / 120);
  const after = thermalCounts();
  const registrations = after.registrations - before.registrations;
  assert.ok(after.updates > before.updates);
  console.log(label, {updates: after.updates - before.updates, registrations});
  return registrations;
}
try {
  assert.equal(measure('initial', f, 3), 1);
  assert.equal(measure('same craft', f, 10), 0);
  while (f.stage < 2) f.stageNext();
  assert.ok(f.detached.length > 0);
  assert.ok(measure('separated fleet', f, 2) > 0);
  assert.equal(measure('unchanged separated fleet', f, 10), 0);
  restored = loadFlight(saveFlight(f));
  assert.ok(measure('restored fleet', restored, 2) > 0);
  assert.equal(measure('original after restore', f, 2), 0);
  const shield = restored.parts.find(p => p.type === 'heatShield');
  shield.r[0] += 0.05;
  assert.equal(measure('remounted shield on same parts array', restored, 1), 1);
  assert.equal(measure('unchanged mount', restored, 2), 0);
} finally {
  restored?.dispose();
  f.dispose();
}

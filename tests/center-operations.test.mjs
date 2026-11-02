import test from 'node:test';
import assert from 'node:assert/strict';
import {appendDesign, readDesignLibrary, designForLaunch} from '../dist/design-library.js';
import {trackingList, trackedFlight} from '../dist/tracking.js';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
test('Named snapshots coexist without overwriting drafts; facility sets only launch environment', () => {
  let library = {version: 1, designs: []};
  const draft = {name: '試験機', parts: preset('plane'), bay: 'sph', environment: 'orbit'};
  library = appendDesign(library, draft, 'one', 100);
  draft.parts[0].p[0] = 4;
  library = appendDesign(library, draft, 'two', 200);
  assert.notEqual(library.designs[0].parts[0].p[0], 4);
  assert.equal(library.designs[1].parts[0].p[0], 4);
  const launch = designForLaunch(library, 'one', 'runway');
  assert.equal(launch.environment, 'runway');
  assert.equal(library.designs[0].environment, 'orbit');
  launch.parts[0].p[0] = 9;
  assert.notEqual(library.designs[0].parts[0].p[0], 9);
  assert.equal(designForLaunch(library, 'one', 'pad').environment, 'land');
  assert.throws(() => readDesignLibrary({version: 1, designs: [library.designs[0], library.designs[0]]}));
  assert.throws(() => designForLaunch(library, 'missing', 'pad'));
});
test('Tracking lists independent vessels and resumes a chosen probe with resource state intact', () => {
  const f = new Flight(preset('twin'), 'orbit');
  f.stageNext();
  f.stageNext();
  const original = saveFlight(f, {name: '双子'}),
    rows = trackingList(original);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.controllable && r.altitude > 79000));
  const result = trackedFlight(original, rows[1].id),
    g = loadFlight(result.record);
  assert.ok(g.parts.some(p => p.id === rows[1].id));
  assert.deepEqual([...g.fuel], [...f.detached[0].fuel]);
  assert.equal(g.time, f.time);
  assert.deepEqual(original, saveFlight(f, {name: '双子'}));
  assert.equal(result.record.meta.name, '双子');
  f.dispose();
  g.dispose();
});
test('Uncontrolled debris is observable without granting controls or mutating the stored fleet', () => {
  const f = new Flight(preset('launcher'), 'orbit');
  f.stageNext();
  f.stageNext();
  const record = saveFlight(f),
    debris = trackingList(record).find(r => !r.controllable);
  assert.ok(debris);
  assert.throws(() => trackedFlight(record, debris.id));
  const observation = trackedFlight(record, debris.id, true);
  assert.equal(observation.observe, debris.id);
  assert.deepEqual(observation.record.parts, record.parts);
  assert.throws(() => trackedFlight(record, 'unknown', true));
  f.dispose();
});

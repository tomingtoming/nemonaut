import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {setParachuteAction, parachuteActions} from '../dist/part-actions.js';
import {parachuteStep, parachuteDrag} from '../dist/recovery.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import * as T from 'three';
test('Part parachute commands wait safely, cancel, deploy and cut without rearming on staging or hotkey', () => {
  const f = new Flight(preset('returner'), 'drop');
  let loaded;
  try {
    const id = [...f.chutes.keys()][0],
      s = f.chutes.get(id);
    assert.equal(setParachuteAction(f, id, 'arm'), true);
    parachuteStep(s, {altitude: 1000, speed: 400, vertical: -50, density: 1}, 1);
    assert.equal(s.status, 'armed');
    assert.equal(setParachuteAction(f, id, 'disarm'), true);
    assert.equal(s.status, 'stowed');
    assert.equal(setParachuteAction(f, id, 'cut'), false);
    setParachuteAction(f, id, 'arm');
    parachuteStep(s, {altitude: 1000, speed: 50, vertical: -50, density: 1}, 3);
    assert.equal(s.status, 'open');
    assert.equal(setParachuteAction(f, id, 'disarm'), false);
    assert.equal(setParachuteAction(f, id, 'cut'), true);
    assert.equal(s.fraction, 0);
    f.armParachutes();
    f.stage = f.parts.find(p => p.id === id).stage - 1;
    f.stageNext();
    assert.equal(s.status, 'cut');
    parachuteStep(s, {landed: true}, 1);
    assert.equal(s.status, 'cut');
    assert.equal(parachuteDrag(new T.Vector3(0, -50, 0), 1, 100, s.fraction, 1000, 0.1).length(), 0);
    loaded = loadFlight(saveFlight(f));
    assert.equal(loaded.chutes.get(id).status, 'cut');
    assert.equal(setParachuteAction(loaded, id, 'arm'), false);
  } finally {
    f.dispose();
    loaded?.dispose();
  }
});
test('Parachute commands reject wrong parts, damaged vessels and disabled hardware', () => {
  const f = new Flight(preset('returner'), 'drop');
  try {
    const id = [...f.chutes.keys()][0],
      other = f.parts.find(p => p.id !== id).id;
    assert.equal(setParachuteAction(f, other, 'arm'), false);
    assert.equal(setParachuteAction(f, id, 'unknown'), false);
    f.crashed = true;
    assert.ok(parachuteActions(f, id).every(a => !a.enabled));
    assert.equal(setParachuteAction(f, id, 'arm'), false);
    f.crashed = false;
    f.thermal.get(id).failed = true;
    assert.equal(setParachuteAction(f, id, 'arm'), false);
  } finally {
    f.dispose();
  }
});

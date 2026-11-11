import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight} from '../dist/core.js';
import {preset, part} from '../dist/catalog.js';
import {portWindowState, operatePort, guideFromPort, setPortTranslation} from '../dist/port-window.js';
import {selectDockingPorts, setTarget} from '../dist/relative-navigation.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
test('Either bonded port can split then selected peer can redock through the part window adapter', () => {
  for (const side of [0, 1]) {
    let f = new Flight(preset('docking'), 'orbit');
    try {
      const id = f.parts.filter(p => p.dockPartner)[side].id;
      assert.equal(portWindowState(f, id).canUndock, true);
      f = operatePort(f, id, 'undock');
      const own = f.parts.find(p => p.type === 'dockingPort').id,
        state = portWindowState(f, own);
      assert.equal(state.targets.length, 1);
      const target = state.targets[0].id;
      assert.equal(portWindowState(f, own, target).canDock, true);
      f = operatePort(f, own, 'dock', target);
      assert.equal(f.parts.length, 14);
      assert.equal(f.detached.length, 0);
      const saved = loadFlight(saveFlight(f));
      try {
        assert.equal(portWindowState(saved, own).canUndock, true);
      } finally {
        saved.dispose();
      }
    } finally {
      f.dispose();
    }
  }
});
test('Stale target, occupied own port and out-of-range docking cannot mutate the fleet', () => {
  let f = new Flight(preset('docking'), 'orbit');
  try {
    const own = f.parts.find(p => p.dockPartner).id;
    assert.throws(() => operatePort(f, own, 'dock', 'missing'));
    f = operatePort(f, own, 'undock');
    const id = f.parts.find(p => p.type === 'dockingPort').id,
      target = portWindowState(f, id).targets[0];
    target.vessel.pos.x += 10;
    const before = saveFlight(f);
    assert.equal(portWindowState(f, id, target.id).canDock, false);
    assert.throws(() => operatePort(f, id, 'dock', target.id));
    assert.throws(() => operatePort(f, id, 'dock', 'stale'));
    assert.deepEqual(saveFlight(f), before);
    f.crashed = true;
    assert.equal(portWindowState(f, id, target.id).canDock, false);
  } finally {
    f.dispose();
  }
});

test('Port guidance binds exact port IDs, aligns without thrust, persists and rejects stale targets', () => {
  let f = new Flight(preset('docking'), 'orbit'),
    restored;
  try {
    f = operatePort(f, f.parts.find(p => p.dockPartner).id, 'undock');
    const own = f.parts.find(p => p.type === 'dockingPort').id,
      target = portWindowState(f, own).targets[0];
    assert.equal(guideFromPort(f, own, target.id), true);
    assert.equal(f.navigationTarget, target.vessel);
    assert.equal(f.targetPartId, target.id);
    assert.deepEqual(f.dockingPorts, {own, target: target.id});
    assert.equal(portWindowState(f, own, target.id).selected, true);
    assert.equal(f.sasMode, 'hold');
    assert.equal(guideFromPort(f, own, target.id, {align: true}), true);
    assert.equal(f.sasMode, 'dock');
    assert.equal(f.sas, true);
    assert.equal(f.throttle, 0);
    assert.equal(f.portTranslationEnabled, false);
    restored = loadFlight(saveFlight(f));
    assert.equal(restored.targetPartId, target.id);
    assert.equal(restored.sasMode, 'dock');
    assert.equal(portWindowState(restored, own, target.id).selected, true);
    const before = saveFlight(f);
    assert.equal(guideFromPort(f, own, 'missing', {align: true}), false);
    assert.deepEqual(saveFlight(f), before);
    f.crashed = true;
    assert.equal(guideFromPort(f, own, target.id, {align: true}), false);
  } finally {
    f.dispose();
    restored?.dispose();
  }
});

test('Part-window translation switch only controls its selected pair and preserves RCS, SAS and throttle', () => {
  let f = new Flight(preset('docking'), 'orbit'),
    restored;
  try {
    f = operatePort(f, f.parts.find(p => p.dockPartner).id, 'undock');
    const own = f.parts.find(p => p.type === 'dockingPort').id,
      target = portWindowState(f, own).targets[0].id;
    assert.equal(setPortTranslation(f, own, target, true), false);
    guideFromPort(f, own, target, {align: true});
    assert.equal(setPortTranslation(f, own, target, true), true);
    assert.equal(f.portTranslationEnabled, true);
    assert.equal(f.rcsEnabled, false);
    assert.equal(f.sasMode, 'dock');
    assert.equal(f.throttle, 0);
    restored = loadFlight(saveFlight(f));
    assert.equal(restored.portTranslationEnabled, true);
    assert.equal(setPortTranslation(f, own, 'stale', false), false);
    assert.equal(f.portTranslationEnabled, true);
    assert.equal(setPortTranslation(f, own, target, false), true);
    assert.equal(f.portTranslationEnabled, false);
    f.crashed = true;
    assert.equal(setPortTranslation(f, own, target, true), false);
  } finally {
    f.dispose();
    restored?.dispose();
  }
});

test('Changing ports through the navigation panel resets guidance and invalidates a pinned window selection', () => {
  const make = () => {
    const p = preset('rcs');
    p.push(
      part('dockingPort', [0, 2, 0], [0, 0, 0], p[0].id),
      part('dockingPort', [2, 0, 0], [0, 0, 1.57], p[0].id)
    );
    return new Flight(p, 'orbit');
  };
  const a = make(),
    b = make();
  a.detached = [b];
  try {
    const [a1, a2] = a.parts.slice(-2).map(p => p.id),
      [b1, b2] = b.parts.slice(-2).map(p => p.id);
    guideFromPort(a, a1, b1, {align: true});
    setPortTranslation(a, a1, b1, true);
    selectDockingPorts(a, a1, b1);
    assert.equal(a.sasMode, 'dock');
    assert.equal(a.portTranslationEnabled, true);
    selectDockingPorts(a, a2, b2);
    assert.equal(a.sasMode, 'hold');
    assert.equal(a.portTranslationEnabled, false);
    assert.equal(a.targetPartId, b2);
    assert.equal(portWindowState(a, a1, b1).selected, false);
    assert.equal(setPortTranslation(a, a1, b1, true), false);
    guideFromPort(a, a2, b2, {align: true});
    setPortTranslation(a, a2, b2, true);
    setTarget(a, a, null);
    assert.equal(a.dockingPorts, null);
    assert.equal(a.portTranslationEnabled, false);
    assert.equal(a.sasMode, 'hold');
    assert.equal(portWindowState(a, a2, b2).selected, false);
  } finally {
    a.dispose();
  }
});

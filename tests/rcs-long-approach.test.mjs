import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {undockVessel, dockVessels, dockingStatus} from '../dist/docking.js';
import {portGuidance} from '../dist/port-navigation.js';
import {setTarget} from '../dist/relative-navigation.js';
test('RCS forces approach from 56 m with lateral offset and dock without teleporting', () => {
  let f = new Flight(preset('docking'), 'orbit');
  f = undockVessel(f, f.parts.find(p => p.dockPartner).id);
  const b = f.detached[0],
    ai = f.parts.find(p => p.type === 'dockingPort').id,
    bi = b.parts.find(p => p.type === 'dockingPort').id;
  setTarget(f, f, b);
  f.dockingPorts = {own: ai, target: bi};
  let g = portGuidance(f, ai, b, bi);
  f.pos.addScaledVector(g.outward, 56).addScaledVector(g.right, 5).addScaledVector(g.top, 3);
  f.rcsEnabled = true;
  f.reactionEnabled = false;
  f.sasMode = 'dock';
  f.portTranslationEnabled = true;
  let i = 0;
  const clamp = x => T.MathUtils.clamp(x, -1, 1);
  try {
    for (; i < 600 * 120; i++) {
      g = portGuidance(f, ai, b, bi);
      if (dockingStatus(f, ai, b, bi).ready) break;
      const desired = g.lateral > 1 ? 0 : Math.min(0.8, Math.max(0, g.axial) * 0.15);
      f.step(1 / 120, {
        portForward: clamp((desired - g.closing) * 2),
        portRight: clamp(-g.horizontal * 0.4 - g.horizontalSpeed * 2),
        portUp: clamp(-g.vertical * 0.4 - g.verticalSpeed * 2)
      });
    }
    assert.ok(i / 120 < 120);
    assert.ok(dockingStatus(f, ai, b, bi).ready);
    assert.ok(g.lateral < 0.001);
    assert.ok(g.speed < 0.03);
    assert.ok([...f.fuel.values()].reduce((a, b) => a + b, 0) < 48);
    if (dockingStatus(f, ai, b, bi).ready) {
      f = dockVessels(f, b, ai, bi);
      assert.equal(f.parts.length, 14);
      assert.equal(f.detached.length, 0);
    }
  } finally {
    f.dispose();
  }
});

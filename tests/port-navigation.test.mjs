import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset, part} from '../dist/catalog.js';
import {undockVessel, dockVessels, dockingStatus} from '../dist/docking.js';
import {portGuidance, portTranslation, portPose} from '../dist/port-navigation.js';
import {setTarget, resolveTargets} from '../dist/relative-navigation.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
function pair() {
  let f = new Flight(preset('docking'), 'orbit');
  f = undockVessel(f, f.parts.find(p => p.dockPartner).id);
  const b = f.detached[0],
    own = f.parts.find(p => p.type === 'dockingPort').id,
    target = b.parts.find(p => p.type === 'dockingPort').id;
  setTarget(f, f, b);
  f.dockingPorts = {own, target};
  return [f, b, own, target];
}
test('Port frame resolves axial and lateral offsets and transforms manual axes into body coordinates', () => {
  const [a, b, ai, bi] = pair();
  let g = portGuidance(a, ai, b, bi);
  a.pos.addScaledVector(g.outward, 5).addScaledVector(g.right, 2).addScaledVector(g.top, -3);
  g = portGuidance(a, ai, b, bi);
  assert.ok(Math.abs(g.axial - 5) < 1e-8);
  assert.ok(Math.abs(g.horizontal - 2) < 1e-8);
  assert.ok(Math.abs(g.vertical + 3) < 1e-8);
  const body = portTranslation(g, a.q, {forward: 1, right: 0, up: 0});
  assert.ok(body.applyQuaternion(a.q).distanceTo(g.outward.clone().negate()) < 1e-9);
  a.dispose();
});
test('Relative frame rates remove target rotation at the offset point', () => {
  const [a, b, ai, bi] = pair();
  let g = portGuidance(a, ai, b, bi);
  a.pos.addScaledVector(g.right, 2);
  b.omega.set(0, 0.1, 0);
  g = portGuidance(a, ai, b, bi);
  const offset = g.own.position.clone().sub(g.target.position);
  a.omega.set(0, 0, 0);
  a.vel.copy(g.target.velocity).add(b.omega.clone().cross(offset));
  g = portGuidance(a, ai, b, bi);
  assert.ok(Math.abs(g.horizontalSpeed) + Math.abs(g.verticalSpeed) + Math.abs(g.closing) < 1e-8);
  a.dispose();
});
test('Port selection and manual frame survive save; missing selections cannot enable guidance', () => {
  const [a, b, ai, bi] = pair();
  a.sasMode = 'dock';
  a.portTranslationEnabled = true;
  const saved = saveFlight(a),
    g = loadFlight(saved);
  assert.deepEqual(g.dockingPorts, {own: ai, target: bi});
  assert.equal(g.portTranslationEnabled, true);
  saved.dockingPorts.target = 'absent';
  assert.throws(() => loadFlight(saved));
  a.dockingPorts.own = 'absent';
  resolveTargets(a);
  assert.equal(a.dockingPorts, null);
  assert.equal(a.sasMode, 'hold');
  assert.equal(a.portTranslationEnabled, false);
  a.dispose();
  g.dispose();
});
test('SAS aligns a sideways-mounted port rather than the craft default forward axis', () => {
  const make = angle => {
      const parts = preset('rcs');
      parts.push(part('dockingPort', [0, 0.8, 0], [0, 0, angle], parts[0].id));
      return new Flight(parts, 'orbit');
    },
    a = make(Math.PI / 2),
    b = make(Math.PI);
  a.detached = [b];
  b.pos.z += 10;
  setTarget(a, a, b);
  a.dockingPorts = {own: a.parts.at(-1).id, target: b.parts.at(-1).id};
  a.rcsEnabled = true;
  a.reactionEnabled = false;
  a.sasMode = 'dock';
  for (let i = 0; i < 2400; i++) a.step(1 / 120);
  assert.ok(portGuidance(a, a.dockingPorts.own, b, a.dockingPorts.target).angle < 0.05);
  a.dispose();
});
test('Manual-frame thruster inputs approach from three meters with lateral offset and dock at low speed', () => {
  let [a, b, ai, bi] = pair();
  let g = portGuidance(a, ai, b, bi);
  a.pos.addScaledVector(g.outward, 3).addScaledVector(g.right, 0.3).addScaledVector(g.top, 0.2);
  a.rcsEnabled = true;
  a.reactionEnabled = false;
  a.sasMode = 'dock';
  a.portTranslationEnabled = true;
  const startingFuel = [...a.fuel.values()].reduce((s, v) => s + v, 0),
    clamp = v => T.MathUtils.clamp(v, -1, 1);
  let ready = false;
  for (let i = 0; i < 14400; i++) {
    g = portGuidance(a, ai, b, bi);
    if (dockingStatus(a, ai, b, bi).ready) {
      ready = true;
      break;
    }
    const desiredClosing = Math.min(0.15, Math.max(0, g.axial) * 0.2);
    a.step(1 / 120, {
      portForward: clamp((desiredClosing - g.closing) * 2),
      portRight: clamp(-g.horizontal * 0.4 - g.horizontalSpeed * 2),
      portUp: clamp(-g.vertical * 0.4 - g.verticalSpeed * 2)
    });
  }
  assert.ok(ready, 'converges through applied RCS forces');
  assert.ok([...a.fuel.values()].reduce((s, v) => s + v, 0) < startingFuel);
  a = dockVessels(a, b, ai, bi);
  assert.equal(a.parts.length, 14);
  assert.equal(a.detached.length, 0);
  a.dispose();
});

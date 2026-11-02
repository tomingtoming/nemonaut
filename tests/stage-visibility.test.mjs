import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {mountStageVisibility} from '../dist/stage-visibility.js';
import {stageThrustDiagnostics} from '../dist/design-diagnostics.js';
import {preset} from '../dist/catalog.js';

test('stage tint never changes shared Blender materials and restores exact originals', () => {
  const material = new T.MeshStandardMaterial({color: 0xffffff}),
    glass = new T.MeshStandardMaterial({transparent: true, opacity: 0.08, depthWrite: false});
  const a = new T.Mesh(new T.BoxGeometry(), material),
    b = new T.Mesh(new T.BoxGeometry(), [material, glass]);
  a.castShadow = b.castShadow = true;
  const objects = new Map([
      ['a', a],
      ['b', b]
    ]),
    overlay = mountStageVisibility(() => objects),
    original = b.material;
  overlay.update(['a']);
  assert.notEqual(a.material, material);
  assert.equal(material.color.getHex(), 0xffffff);
  assert.equal(material.opacity, 1);
  assert.equal(b.material[0].opacity, 0.12);
  assert.equal(b.material[1].opacity, 0.08);
  assert.equal(b.castShadow, false);
  assert.equal(b.material[0].depthWrite, false);
  const tinted = a.material;
  let disposed = 0;
  tinted.addEventListener('dispose', () => disposed++);
  overlay.update(['a']);
  assert.equal(a.material, tinted);
  assert.equal(disposed, 0);
  overlay.update(['b']);
  assert.equal(disposed, 1);
  assert.equal(a.material.opacity, 0.12);
  assert.equal(b.castShadow, true);
  overlay.update(null);
  assert.equal(a.material, material);
  assert.equal(b.material, original);
  assert.equal(b.castShadow, true);
  overlay.dispose();
  assert.equal(material.color.getHex(), 0xffffff);
});

test('unchanged stage reapplies to rebuilt objects and releases removed objects', () => {
  const source = new T.MeshStandardMaterial(),
    old = new T.Mesh(new T.BoxGeometry(), source);
  let objects = new Map([['a', old]]);
  const overlay = mountStageVisibility(() => objects);
  overlay.update(['a']);
  let disposed = 0;
  old.material.addEventListener('dispose', () => disposed++);
  const replacement = new T.Mesh(new T.BoxGeometry(), source);
  objects = new Map([['a', replacement]]);
  overlay.update(['a']);
  assert.equal(old.material, source);
  assert.equal(disposed, 1);
  assert.notEqual(replacement.material, source);
  overlay.update(null);
  assert.equal(replacement.material, source);
});

test('retained visualization follows 29/13/8 stages and independent reference craft', () => {
  const rocket = preset('lunar-expedition'),
    other = preset('rocket').map(p => ({
      ...p,
      id: 'other-' + p.id,
      parent: p.parent ? 'other-' + p.parent : null
    })),
    parts = [...rocket, ...other],
    before = structuredClone(parts);
  const objects = new Map(
      parts.map(p => [p.id, new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial())])
    ),
    overlay = mountStageVisibility(() => objects);
  for (const stage of stageThrustDiagnostics(parts, rocket[0].id).stages) {
    overlay.update(stage.partIds);
    assert.equal([...objects.values()].filter(o => o.material.opacity === 1).length, stage.partIds.length);
    assert.ok(other.every(p => objects.get(p.id).material.opacity === 0.12));
  }
  assert.deepEqual(
    stageThrustDiagnostics(parts, rocket[0].id).stages.map(s => s.partIds.length),
    [29, 13, 8]
  );
  const otherControl = other.find(p => p.type === 'capsule');
  const otherStage = stageThrustDiagnostics(parts, otherControl.id).stages[0];
  overlay.update(otherStage.partIds);
  assert.ok(rocket.every(p => objects.get(p.id).material.opacity === 0.12));
  overlay.dispose();
  assert.ok([...objects.values()].every(o => o.material.opacity === 1));
  assert.deepEqual(parts, before);
});

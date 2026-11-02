import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {preset} from '../dist/catalog.js';
import {fuelNetworks} from '../dist/resources.js';
import {createFuelOverlay} from '../dist/fuel-overlay.js';
test('Fuel overlay follows the selected feed network without changing source meshes', () => {
  const parts = preset('launcher'),
    scene = new T.Scene(),
    material = new T.MeshBasicMaterial(),
    objects = new Map(
      parts.map(p => {
        const mesh = new T.Mesh(new T.BoxGeometry(1, 1, 1), material);
        mesh.position.fromArray(p.p);
        scene.add(mesh);
        return [p.id, mesh];
      })
    );
  const target = parts[8],
    network = fuelNetworks(parts).network.get(target.id),
    view = createFuelOverlay(scene);
  view.show(parts, target.id, objects);
  assert.deepEqual(
    new Set(view.group.children.filter(o => o.userData.fuelPartId).map(o => o.userData.fuelPartId)),
    new Set([...network.tanks, ...network.engines].map(p => p.id))
  );
  assert.ok(objects.values().every(o => o.material === material));
  const links = view.group.children.find(o => !o.userData.fuelPartId);
  assert.equal(links.geometry.attributes.position.count, (network.parts.length - 1) * 2);
  let disposed = 0;
  for (const o of view.group.children) o.geometry.addEventListener('dispose', () => disposed++);
  const count = view.group.children.length;
  view.clear();
  assert.equal(disposed, count);
  assert.equal(view.group.children.length, 0);
  for (const o of objects.values()) o.geometry.dispose();
  material.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Box3, Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PARTS} from '../dist/catalog.js';

test('Blender exports preserve assembly dimensions, origins and finite mesh data', async () => {
  for (const [id, part] of Object.entries(PARTS)) {
    const data = await readFile(new URL(`../dist/assets/parts/${part.model || id}.glb`, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      ''
    );
    const bounds = new Box3().setFromObject(gltf.scene),
      size = bounds.getSize(new Vector3()),
      center = bounds.getCenter(new Vector3());
    for (let axis = 0; axis < 3; axis++)
      assert.ok(Math.abs(size.getComponent(axis) - part.size[axis]) < 0.002, `${id}: dimension ${axis}`);
    assert.ok(Math.abs(center.y) < 0.002 && Math.abs(center.z) < 0.002, `${id}: centered Y/Z`);
    assert.ok(Math.abs(center.x) < 0.002, `${id}: centered X`);
    let triangles = 0;
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      assert.ok(o.geometry.getAttribute('normal'), `${id}: normals`);
      for (const name of ['position', 'normal'])
        for (const value of o.geometry.getAttribute(name).array)
          assert.ok(Number.isFinite(value), `${id}: finite ${name}`);
      triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
    });
    assert.ok(triangles > 0, `${id}: nonempty export`);
  }
});

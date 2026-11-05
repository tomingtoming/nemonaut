import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Box3, Matrix4, Vector3, Quaternion, Euler} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {preset} from '../dist/catalog.js';

test('rover and courier solar panels touch their parent core in actual exported geometry', async () => {
  const bounds = new Map();
  for (const type of ['probe', 'solar']) {
    const data = await readFile(new URL(`../src/assets/parts/${type}.glb`, import.meta.url));
    const {scene} = await new GLTFLoader().parseAsync(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      ''
    );
    bounds.set(type, new Box3().setFromObject(scene));
  }
  const worldBounds = p =>
    bounds
      .get(p.type)
      .clone()
      .applyMatrix4(
        new Matrix4().compose(
          new Vector3(...p.p),
          new Quaternion().setFromEuler(new Euler(...p.r)),
          new Vector3(1, 1, 1)
        )
      );
  for (const kind of ['rover', 'courier']) {
    const parts = preset(kind),
      solar = parts.find(p => p.type === 'solar');
    const parent = parts.find(p => p.id === solar.parent);
    assert.equal(parent.type, 'probe');
    const panelBox = worldBounds(solar),
      coreBox = worldBounds(parent);
    const gap = panelBox.min.y - coreBox.max.y;
    assert.ok(Math.abs(gap) < 0.002, `${kind}: mounting gap ${gap} m`);
    assert.ok(panelBox.min.x < coreBox.max.x && panelBox.max.x > coreBox.min.x);
    assert.ok(panelBox.min.z < coreBox.max.z && panelBox.max.z > coreBox.min.z);
    const old = worldBounds({...solar, p: [solar.p[0], 2, solar.p[2]]});
    assert.ok(old.min.y - coreBox.max.y > 0.15, 'old placement must fail the contact criterion');
  }
});

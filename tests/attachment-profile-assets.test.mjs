import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PARTS} from '../dist/catalog.js';
import {attachmentProfile} from '../dist/attachment-profile.js';

// Measure the exported asset in part coordinates, including GLTF node transforms.
// This checks the flange envelope, not the topology of its mating face.
test('declared adapter and engine mount diameters match the exported Blender flanges', async () => {
  const types = [
    'adapterSmall',
    'adapterLarge',
    'engine',
    'engineSeaSmall',
    'engineVacSmall',
    'engineSeaMedium',
    'engineVacMedium',
    'engineSeaLarge',
    'engineVacLarge'
  ];
  for (const type of types) {
    const data = await readFile(new URL(`../src/assets/parts/${type}.glb`, import.meta.url));
    const {scene} = await new GLTFLoader().parseAsync(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      ''
    );
    scene.updateMatrixWorld(true);
    const vertices = [];
    scene.traverse(o => {
      if (!o.isMesh) return;
      const position = o.geometry.attributes.position;
      for (let i = 0; i < position.count; i++)
        vertices.push(new Vector3().fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld));
    });
    for (const node of [0, 1]) {
      const profile = attachmentProfile(type, node);
      if (!profile) continue;
      const sign = node === 0 ? 1 : -1,
        end = PARTS[type].size[1] / 2;
      const band = vertices.filter(v => sign * v.y > end - 0.06);
      assert.ok(band.length > 0, `${type}/${node}: flange has vertices`);
      const diameter = 2 * Math.max(...band.map(v => Math.hypot(v.x, v.z)));
      const extent = Math.max(...band.map(v => sign * v.y));
      assert.ok(Math.abs(diameter - profile.diameter) < 0.002, `${type}/${node}: ${diameter}`);
      assert.ok(Math.abs(extent - end) < 0.002, `${type}/${node}: node lies at flange end`);
    }
    scene.traverse(o => {
      if (o.isMesh) o.geometry.dispose();
    });
  }
});

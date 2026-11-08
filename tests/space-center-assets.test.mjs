import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {campusPadOrigin, addPadBuildings} from '../dist/campus-scenery.js';
import {PLANET} from '../dist/planet.js';
import {Box3, Group, Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
test('detailed campus retains launch-complex scale and bounded rendering cost', async () => {
  const data = await readFile(new URL('../dist/assets/scenery/space-center.glb', import.meta.url));
  const {scene} = await new GLTFLoader().parseAsync(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    ''
  );
  let meshes = 0,
    triangles = 0,
    pad;
  scene.traverse(o => {
    if (o.userData.facility === 'pad') pad = o;
    if (o.isMesh) {
      meshes++;
      triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    }
  });
  assert.ok(meshes < 100, `mesh count ${meshes}`);
  assert.ok(triangles < 180000, `triangles ${triangles}`);
  const bounds = new Box3().setFromObject(pad),
    size = bounds.getSize(new Vector3());
  assert.ok(size.x > 70 && size.z > 100 && size.y > 40 && size.y < 43);
  assert.ok(bounds.min.x > 45 && bounds.max.x < 170);
  assert.ok(data.byteLength < 8_000_000);
});
test('Blender campus has selectable facility roots with finite nonempty geometry', async () => {
  const data = await readFile(new URL('../dist/assets/scenery/space-center.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    ''
  );
  const facilities = new Map();
  gltf.scene.traverse(o => {
    if (o.userData.facility) facilities.set(o.userData.facility, o);
    if (o.isMesh)
      for (const name of ['position', 'normal']) {
        assert.ok(o.geometry.getAttribute(name));
        assert.ok([...o.geometry.getAttribute(name).array].every(Number.isFinite));
      }
  });
  assert.deepEqual([...facilities.keys()].sort(), ['pad', 'runway', 'sph', 'tracking', 'vab']);
  for (const o of facilities.values()) {
    const size = new Box3().setFromObject(o).getSize(new Vector3());
    assert.ok(size.x > 10 && size.y > (o.userData.facility === 'runway' ? 0.1 : 5) && size.z > 10);
  }
  assert.ok(new Box3().setFromObject(facilities.get('vab')).getSize(new Vector3()).y > 60);
});

test('campus pad and flight pad retain matching meshes at a common launch datum', async () => {
  async function load(name) {
    const data = await readFile(new URL('../dist/assets/scenery/' + name + '.glb', import.meta.url));
    const {scene} = await new GLTFLoader().parseAsync(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      ''
    );
    return scene;
  }
  const [campus, flight] = await Promise.all([load('space-center'), load('launchpad')]);
  const pad = campus.getObjectByProperty('name', 'pad');
  assert.equal(pad?.userData.facility, 'pad');
  const datum = campusPadOrigin;
  const flightMeshes = flight.children.filter(o => o.isMesh);
  assert.ok(flightMeshes.length > 0);
  assert.equal(pad.children.length, flightMeshes.length);
  const site = new Group();
  addPadBuildings(site, campus);
  const buildings = site.children[0];
  assert.deepEqual(buildings.children.map(o => o.userData.facility).sort(), ['tracking', 'vab']);
  for (const copy of buildings.children) {
    const original = campus.getObjectByName(copy.name);
    assert.notEqual(copy, original);
    const expected = new Box3()
      .setFromObject(original)
      .translate(new Vector3(0, PLANET.radius, 0).sub(datum));
    site.updateMatrixWorld(true);
    const actual = new Box3().setFromObject(copy);
    assert.ok(actual.min.distanceTo(expected.min) < 0.001);
    assert.ok(actual.max.distanceTo(expected.max) < 0.001);
  }
  for (const mesh of flightMeshes) {
    const name = mesh.name.replace(/^Pad01_/, 'pad_');
    const overview = pad.children.find(o => o.name.replaceAll(' ', '_') === name);
    assert.ok(overview?.isMesh, name);
    const actual = new Box3().setFromObject(overview).translate(datum.clone().negate());
    const expected = new Box3().setFromObject(mesh);
    for (const end of ['min', 'max']) assert.ok(actual[end].distanceTo(expected[end]) < 0.001, name);
  }
});

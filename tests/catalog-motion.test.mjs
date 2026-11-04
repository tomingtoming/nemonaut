import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Box3, Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PARTS} from '../dist/catalog.js';
import {screwRotor} from '../dist/screw-spin.js';

async function model(id, part) {
  const data = await readFile(new URL(`../dist/assets/parts/${part.model || id}.glb`, import.meta.url));
  return (
    await new GLTFLoader().parseAsync(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      ''
    )
  ).scene;
}
function hasGeometry(object) {
  return object && !new Box3().setFromObject(object).isEmpty();
}

// Enumerate capabilities, so new parts automatically join the asset contract.
for (const [id, part] of Object.entries(PARTS)) {
  if (part.gimbal) {
    test(`${id}: gimbal has a visible articulated nozzle`, async () => {
      const scene = await model(id, part);
      const nozzle = scene.getObjectByName('GimbalNozzle');
      assert.ok(hasGeometry(nozzle), `${id}: missing or empty GimbalNozzle`);
      const original = nozzle.name;
      nozzle.name = 'MissingNozzle';
      assert.equal(scene.getObjectByName('GimbalNozzle'), undefined, 'renaming the joint must be detectable');
      nozzle.name = original;
    });
  }
  if (part.water && part.thrust) {
    test(`${id}: actual screw export yields a rotor with the catalog radius`, async () => {
      const scene = await model(id, part);
      const rotor = screwRotor(scene);
      assert.ok(hasGeometry(rotor), `${id}: rotor extraction failed`);
      const size = new Box3().setFromObject(rotor).getSize(new Vector3());
      assert.ok(Math.abs(Math.max(size.x, size.z) - Math.max(part.size[0], part.size[2])) < 0.002);
      const geometry = rotor.children[0];
      rotor.remove(geometry);
      assert.equal(hasGeometry(rotor), false, 'empty moving groups are not valid rotors');
    });
  }
  if (part.wheel) {
    test(`${id}: wheel rolling plane matches its catalog radius`, async () => {
      const scene = await model(id, part);
      const size = new Box3().setFromObject(scene).getSize(new Vector3());
      assert.ok(Math.abs(size.y - part.size[1]) < 0.002);
      assert.ok(Math.abs(size.z - size.y) < 0.002, 'wheel rolls around local X');
    });
  }
}

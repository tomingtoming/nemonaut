import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {preset} from '../dist/catalog.js';
import {
  readDesignLibrary,
  writeDesignLibrary,
  appendDesign,
  designForLaunch
} from '../dist/design-library.js';
const equalParts = (a, b) => {
  assert.equal(a.length, b.length);
  a.forEach((p, i) => {
    assert.ok(new T.Vector3(...p.p).distanceTo(new T.Vector3(...b[i].p)) < 1e-10);
    assert.deepEqual({...p, p: []}, {...b[i], p: []});
  });
};
const legacy = () => ({
  version: 1,
  designs: [
    {id: 'a', name: 'aircraft', parts: preset('transport'), bay: 'sph', environment: 'runway', savedAt: 123}
  ]
});
test('legacy designs upgrade, preserve metadata and launch poses through repeated stored roundtrips', () => {
  const source = legacy(),
    before = structuredClone(source);
  let library = source;
  for (let i = 0; i < 5; i++) {
    const encoded = writeDesignLibrary(library);
    assert.equal(encoded.version, 2);
    assert.equal(encoded.partFrame, 'nominal-center-v1');
    assert.notDeepEqual(encoded.designs[0].parts, source.designs[0].parts);
    library = readDesignLibrary(JSON.parse(JSON.stringify(encoded)));
    assert.deepEqual(library, encoded);
    assert.deepEqual(writeDesignLibrary(library), encoded);
    assert.deepEqual({...library.designs[0], parts: []}, {...before.designs[0], parts: []});
    equalParts(designForLaunch(library, 'a', 'runway').parts, before.designs[0].parts);
  }
  assert.deepEqual(source, before);
});
test('appending to a persisted library decodes existing entries exactly once', () => {
  const source = legacy(),
    encoded = writeDesignLibrary(source);
  const parts = preset('plane');
  parts.find(p => p.type === 'jet').thrustLimit = 0.5;
  const library = appendDesign(encoded, {name: 'second', parts, bay: 'sph', environment: 'runway'}, 'b', 456);
  const restored = readDesignLibrary(writeDesignLibrary(library));
  equalParts(designForLaunch(restored, 'a', 'runway').parts, source.designs[0].parts);
  equalParts(designForLaunch(restored, 'b', 'runway').parts, parts);
  assert.equal(restored.designs[1].parts.find(p => p.type === 'jet').thrustLimit, 0.5);
  assert.deepEqual(readDesignLibrary(writeDesignLibrary({version: 1, designs: []})), {
    version: 2,
    partFrame: 'nominal-center-v1',
    designs: []
  });
});
test('unknown versions and missing or conflicting coordinate tags reject atomically', () => {
  const good = writeDesignLibrary(legacy());
  for (const mutate of [
    s => delete s.partFrame,
    s => (s.partFrame = 'future'),
    s => (s.version = 99),
    s => (s.version = 1),
    s => (s.designs[0].parts[0].p = [NaN, 0, 0]),
    s => s.designs.push(s.designs[0])
  ]) {
    const bad = structuredClone(good);
    mutate(bad);
    const before = structuredClone(bad);
    assert.throws(() => readDesignLibrary(bad));
    assert.deepEqual(bad, before);
  }
});

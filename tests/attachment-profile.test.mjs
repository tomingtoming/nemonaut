import test from 'node:test';
import assert from 'node:assert/strict';
import {PARTS, nodes, part} from '../dist/catalog.js';
import {attachmentProfile, attachmentFit} from '../dist/attachment-profile.js';
import {nodeConnection, nodePose} from '../dist/attachment-nodes.js';
import {catalogContractErrors} from '../tools/catalog-contract.mjs';

test('adapter interfaces bridge the three tank sizes without using their envelope diameter', () => {
  for (const [small, adapter, large] of [
    ['tankSmall', 'adapterSmall', 'tank'],
    ['tank', 'adapterLarge', 'tankLarge']
  ]) {
    assert.equal(attachmentFit(small, 1, adapter, 0), 'matched');
    assert.equal(attachmentFit(adapter, 1, large, 0), 'matched');
    assert.equal(attachmentFit(small, 1, adapter, 1), 'different-size');
    assert.equal(attachmentFit(small, 1, large, 0), 'different-size');
  }
});

test('rings use their declared size and scaled fuselages scale the interface diameter', () => {
  for (const [tank, ring] of [
    ['tankSmall', 'decouplerSmall'],
    ['tank', 'decoupler'],
    ['tankLarge', 'decouplerLarge']
  ])
    assert.equal(attachmentFit(tank, 1, ring, 0), 'matched');
  assert.equal(attachmentProfile('transportFuselage', 0).diameter, 6);
  assert.equal(attachmentProfile('fuselageLarge', 1).diameter, 3.75);
  assert.equal(attachmentProfile('tank', 0).diameter, 1.25);
});

test('unknown surfaces and wings remain unspecified, not rejected or inferred as circular', () => {
  assert.equal(attachmentFit('tank', 2, 'tank', 3), 'unspecified');
  assert.equal(attachmentFit('wing', 0, 'tank', 2), 'unspecified');
  assert.equal(attachmentProfile('cargoBay', 0), null);
  for (const node of [-1, 0.5, 99]) assert.throws(() => attachmentProfile('tank', node));
});

test('engine mount sizes are declared without treating the nozzle as a mating flange', () => {
  for (const [engine, tank] of [
    ['engine', 'tank'],
    ['engineSeaSmall', 'tankSmall'],
    ['engineVacSmall', 'tankSmall'],
    ['engineSeaMedium', 'tank'],
    ['engineVacMedium', 'tank'],
    ['engineSeaLarge', 'tankLarge'],
    ['engineVacLarge', 'tankLarge']
  ]) {
    assert.equal(attachmentFit(tank, 1, engine, 0), 'matched');
    assert.equal(attachmentProfile(engine, 1), null);
    assert.equal(attachmentFit(engine, 1, 'decoupler', 0), 'unspecified');
  }
  assert.deepEqual(catalogContractErrors({oneEnd: {...PARTS.tank, stackDiameters: [null, 1.25]}}), []);
});

test('rotated adapter retains node identities and existing node connections', () => {
  const tank = part('tankSmall'),
    adapter = part('adapterSmall', [0, -0.8, 0], [0, Math.PI, 0], tank.id);
  adapter.attachment = {mode: 'node', parentNode: 1, ownNode: 0};
  assert.equal(nodeConnection([tank, adapter], adapter).ownNode, 0);
  assert.equal(attachmentFit(tank.type, 1, adapter.type, 0), 'matched');
  const reversed = part('adapterSmall', [0, 0, 0], [Math.PI, 0, 0]);
  assert.ok(nodePose(reversed, 0).normal.y < -0.999);
  assert.equal(attachmentProfile(reversed.type, 0).diameter, 0.625);
  assert.deepEqual(nodes('adapterSmall')[0], [0, 0.3, 0, 0, 1, 0]);
});

test('catalog rejects malformed diameters and ambiguous node ordering', () => {
  for (const change of [
    {stackDiameters: [0, 1]},
    {stackDiameters: [1, Infinity]},
    {stackDiameters: [1]},
    {rootWing: true},
    {attachmentNodes: [[0, 0, 0, 0, 1, 0]]}
  ]) {
    assert.ok(
      catalogContractErrors({bad: {...PARTS.tank, ...change}}).some(e => e.includes('stackDiameters'))
    );
  }
});

test('rectangular frame interfaces retain shape and scale rather than becoming circular diameters', () => {
  assert.deepEqual(attachmentProfile('truss', 0), {mode: 'stack', shape: 'rectangle', width: 1, height: 1});
  assert.deepEqual(attachmentProfile('marineFrame', 1), {
    mode: 'stack',
    shape: 'rectangle',
    width: 4,
    height: 4
  });
  assert.deepEqual(attachmentProfile('enginePylon', 0), {
    mode: 'stack',
    shape: 'rectangle',
    width: 1.5,
    height: 1.5
  });
  assert.equal(attachmentFit('truss', 0, 'truss', 1), 'matched');
  assert.equal(attachmentFit('truss', 0, 'marineFrame', 1), 'different-size');
  assert.equal(attachmentFit('truss', 0, 'tank', 1), 'different-shape');
  assert.equal(attachmentFit('truss', 2, 'tank', 1), 'unspecified');
  for (const stackRectangles of [
    [
      [0, 1],
      [1, 1]
    ],
    [[1, NaN], null],
    [[1, 1]],
    [[1], null]
  ])
    assert.ok(
      catalogContractErrors({bad: {...PARTS.truss, stackRectangles}}).some(e => e.includes('stackRectangles'))
    );
  assert.ok(
    catalogContractErrors({bad: {...PARTS.truss, stackDiameters: [1, 1]}}).some(e =>
      e.includes('stackRectangles')
    )
  );
});

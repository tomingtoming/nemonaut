import test from 'node:test';
import assert from 'node:assert/strict';
import {Flight, validateCraft} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {examples} from '../dist/examples.js';
import {
  ACTION_GROUPS,
  OPERATIONS,
  partOperations,
  operationGroups,
  setOperationGroups,
  assignActionGroup,
  groupMembers,
  groupSummary,
  groupRows
} from '../dist/action-groups.js';
import {fireActionGroup, groupNotice} from '../dist/action-group-fire.js';
import {actionGroupKey, acceptsFlightKey} from '../dist/flight-keyboard.js';
import {partActions, setPartAction} from '../dist/part-actions.js';
import {saveCraft, loadCraft} from '../dist/craft-save.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {worldFromFlight, flightFromWorld, validateWorld} from '../dist/world-save.js';
import {readDesignLibrary, appendDesign} from '../dist/design-library.js';
import {exampleId} from '../dist/metrics.js';
import {SAVED_PART_FRAME} from '../dist/part-save-frame.js';
import {dockVessels} from '../dist/docking.js';

const ids = (parts, test) => parts.filter(test).map(p => p.id);
const isOn = (f, id, key) => partActions(f, id).find(a => a.key === key).on;
/** The asparagus example with group 1 = booster engines, group 2 = booster separation rings. */
const boosters = () => {
  const parts = preset('asparagus'),
    rings = parts.filter(p => PARTS[p.type].decoupler),
    engines = parts.filter(
      p => PARTS[p.type].thrust && rings.some(r => parts.find(t => t.id === p.parent).parent === r.id)
    );
  assert.equal(rings.length, 2);
  assert.equal(engines.length, 2);
  for (const p of engines) setOperationGroups(p, 'engine', [1]);
  for (const p of rings) setOperationGroups(p, 'decouple', [2]);
  return {parts, rings, engines};
};

test('Operations offered follow the part type, and ids are unique and stable', () => {
  assert.deepEqual(
    OPERATIONS.map(o => o.id),
    [
      'engine',
      'fuelEnabled',
      'fuelCrossfeed',
      'gimbalEnabled',
      'controlEnabled',
      'reactionEnabled',
      'steeringEnabled',
      'driveEnabled',
      'cargoOpen',
      'observation',
      'chuteArm',
      'chuteDisarm',
      'chuteCut',
      'decouple',
      'undock'
    ]
  );
  const of = type => partOperations(type).map(o => o.id);
  assert.deepEqual(of('engineSeaMedium'), ['engine', 'gimbalEnabled']);
  assert.deepEqual(of('tank'), ['fuelEnabled']);
  assert.deepEqual(of('decouplerSmall'), ['fuelCrossfeed', 'decouple']);
  assert.deepEqual(of('dockingPort'), ['fuelCrossfeed', 'undock']);
  assert.deepEqual(of('parachute'), ['chuteArm', 'chuteDisarm', 'chuteCut']);
  assert.deepEqual(of('cargoBay'), ['cargoOpen']);
  assert.deepEqual(of('truss'), []);
  assert.deepEqual(of('no-such-part'), []);
  // Every two-state operation is one the flight part window offers under the same key.
  for (const type of Object.keys(PARTS)) {
    const f = {parts: [{id: 'a', type}], observations: new Map(), active: new Set()},
      keys = partActions(f, 'a').map(a => a.key);
    for (const o of partOperations(type).filter(o => o.kind === 'toggle'))
      assert.ok(keys.includes(o.id), type + ' ' + o.id);
  }
});

test('Assigning and unassigning stores a list per operation and removes empty assignments', () => {
  const [p] = preset('asparagus').filter(p => PARTS[p.type].thrust);
  assert.deepEqual(operationGroups(p, 'engine'), []);
  setOperationGroups(p, 'engine', [3]);
  setOperationGroups(p, 'gimbalEnabled', [0, 4, 4]);
  assert.deepEqual(p.actionGroups, {engine: [3], gimbalEnabled: [0, 4]});
  setOperationGroups(p, 'engine', []);
  assert.deepEqual(p.actionGroups, {gimbalEnabled: [0, 4]});
  setOperationGroups(p, 'gimbalEnabled', []);
  assert.equal('actionGroups' in p, false);
  assert.throws(() => setOperationGroups(p, 'cargoOpen', [1]));
  assert.throws(() => setOperationGroups(p, 'engine', [10]));
  assert.throws(() => setOperationGroups(p, 'engine', [1.5]));
  assert.equal('actionGroups' in p, false);
});

test('Validation rejects malformed assignments, foreign operations and groups outside 0–9', () => {
  const base = preset('asparagus'),
    engine = base.findIndex(p => PARTS[p.type].thrust),
    check = value => {
      const parts = structuredClone(base);
      parts[engine].actionGroups = value;
      return validateCraft({version: 1, parts});
    };
  assert.deepEqual(check({engine: [1], gimbalEnabled: [0, 9]})[engine].actionGroups, {
    engine: [1],
    gimbalEnabled: [0, 9]
  });
  for (const bad of [
    null,
    [],
    {},
    'engine',
    {engine: 1},
    {engine: []},
    {engine: ['1']},
    {engine: [10]},
    {engine: [-1]},
    {engine: [1.5]},
    {engine: [1, 1]},
    {engine: [NaN]},
    {cargoOpen: [1]},
    {decouple: [1]},
    {thrustLimit: [1]},
    {toString: [1]}
  ])
    assert.throws(() => check(bad), JSON.stringify(bad));
});

test('Every example validates without assignments and loads unchanged', () => {
  for (const id of Object.keys(examples)) {
    const parts = validateCraft({version: 1, parts: preset(id)});
    assert.ok(
      parts.every(p => p.actionGroups === undefined),
      id
    );
    assert.deepEqual(groupRows(parts), []);
    assert.deepEqual(loadCraft(saveCraft(parts, id)), parts);
  }
});

test('Assignments survive craft, design library, flight and world saves', () => {
  const {parts} = boosters(),
    expected = parts.map(p => p.actionGroups);
  assert.deepEqual(
    loadCraft(JSON.parse(JSON.stringify(saveCraft(parts, 'Trident')))).map(p => p.actionGroups),
    expected
  );
  const library = readDesignLibrary(
    JSON.parse(
      JSON.stringify(
        appendDesign(
          {version: 2, partFrame: SAVED_PART_FRAME, designs: []},
          {name: 'Trident', parts, bay: 'vab', environment: 'land'}
        )
      )
    )
  );
  assert.deepEqual(
    library.designs.at(-1).parts.map(p => p.actionGroups),
    expected
  );
  const f = new Flight(parts, 'land');
  try {
    const saved = JSON.parse(JSON.stringify(saveFlight(f))),
      g = loadFlight(saved);
    assert.deepEqual(
      g.parts.map(p => p.actionGroups),
      expected
    );
    g.dispose();
    const world = validateWorld(JSON.parse(JSON.stringify(worldFromFlight(saved)))),
      h = loadFlight(flightFromWorld(world));
    assert.deepEqual(
      h.parts.map(p => p.actionGroups),
      expected
    );
    h.dispose();
    const bad = structuredClone(saved);
    bad.parts[0].actionGroups = {engine: [1]};
    assert.throws(() => loadFlight(bad));
  } finally {
    f.dispose();
  }
});

test('Symmetric counterparts are assigned together when linked, alone when not', () => {
  const parts = preset('asparagus'),
    fins = parts.filter(p => p.type === 'fin').slice(0, 2);
  for (const p of fins) p.symmetryGroup = 'fins';
  const linked = assignActionGroup(parts, fins[0].id, 'controlEnabled', 5);
  assert.deepEqual(
    linked.filter(p => p.actionGroups).map(p => p.id),
    fins.map(p => p.id)
  );
  assert.ok(
    parts.every(p => p.actionGroups === undefined),
    'the input is not changed'
  );
  const single = assignActionGroup(linked, fins[1].id, 'controlEnabled', null, false);
  assert.deepEqual(
    single.filter(p => p.actionGroups).map(p => p.id),
    [fins[0].id]
  );
  assert.deepEqual(
    assignActionGroup(linked, fins[0].id, 'controlEnabled', null).filter(p => p.actionGroups),
    []
  );
  assert.throws(() => assignActionGroup(parts, fins[0].id, 'engine', 1));
  assert.throws(() => assignActionGroup(parts, fins[0].id, 'controlEnabled', 12));
  assert.throws(() => assignActionGroup(parts, 'missing', 'controlEnabled', 1));
  validateCraft({version: 1, parts: linked});
});

test('Summary rows list the non-empty groups in key order with counts', () => {
  const {parts, engines} = boosters();
  assert.deepEqual(groupRows(parts), [
    {group: 1, summary: 'エンジン×2'},
    {group: 2, summary: '切離し×2'}
  ]);
  setOperationGroups(engines[0], 'gimbalEnabled', [0]);
  setOperationGroups(
    parts.find(p => p.type === 'tank'),
    'fuelEnabled',
    [1]
  );
  assert.equal(groupSummary(parts, 1), 'エンジン×2 · 燃料使用');
  assert.deepEqual(
    groupRows(parts).map(r => r.group),
    [1, 2, 0]
  );
  assert.equal(groupSummary(parts, 7), '');
  assert.deepEqual(groupMembers(parts, 0), [{id: engines[0].id, operation: 'gimbalEnabled'}]);
  assert.deepEqual([...ACTION_GROUPS], [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
});

test('Group keys are the digit row only, and never fire from a field being edited', () => {
  assert.deepEqual(['Digit1', 'Digit9', 'Digit0'].map(actionGroupKey), [1, 9, 0]);
  for (const code of ['Numpad1', 'Numpad0', 'KeyA', 'F1', 'Digit', 'Digit10', 'Space'])
    assert.equal(actionGroupKey(code), null, code);
  const field = type => ({tagName: 'INPUT', type});
  assert.equal(acceptsFlightKey(field('number'), 'Digit1'), false);
  assert.equal(acceptsFlightKey(field('text'), 'Digit1'), false);
  assert.equal(acceptsFlightKey(field('range'), 'Digit1'), false);
  assert.equal(acceptsFlightKey({tagName: 'SELECT'}, 'Digit1'), false);
  assert.equal(acceptsFlightKey({tagName: 'TEXTAREA'}, 'Digit1'), false);
  assert.equal(acceptsFlightKey({isContentEditable: true, tagName: 'DIV'}, 'Digit1'), false);
  assert.equal(acceptsFlightKey({tagName: 'BUTTON'}, 'Digit1'), true);
  assert.equal(acceptsFlightKey({tagName: 'CANVAS'}, 'Digit1'), true);
});

test('Engines align then flip: any on turns all off, all off turns all on', () => {
  const {parts, engines} = boosters(),
    f = new Flight(parts, 'land');
  try {
    const [a, b] = engines.map(p => p.id),
      core = f.parts.find(p => PARTS[p.type].thrust && !engines.some(e => e.id === p.id)).id;
    let r = fireActionGroup(f, 1);
    assert.deepEqual(r.ran, [{operation: 'engine', on: true, count: 2}]);
    assert.equal(r.flight, f);
    assert.equal(r.separated, false);
    assert.equal(r.assigned, 2);
    assert.ok(f.active.has(a) && f.active.has(b) && !f.active.has(core));
    assert.equal(groupNotice(1, r.ran), 'グループ1：エンジン始動 ×2');
    r = fireActionGroup(f, 1);
    assert.deepEqual(r.ran, [{operation: 'engine', on: false, count: 2}]);
    assert.ok(!f.active.has(a) && !f.active.has(b));
    // Mixed: one on, one off → both off; only the one that changed is counted.
    setPartAction(f, a, 'engine', true);
    r = fireActionGroup(f, 1);
    assert.deepEqual(r.ran, [{operation: 'engine', on: false, count: 1}]);
    assert.ok(!f.active.has(a) && !f.active.has(b));
    assert.equal(groupNotice(1, r.ran), 'グループ1：エンジン停止');
    // An unassigned group does nothing.
    r = fireActionGroup(f, 5);
    assert.deepEqual([r.assigned, r.ran], [0, []]);
    assert.equal(groupNotice(5, r.ran), 'グループ5：実行できる操作がありません');
  } finally {
    f.dispose();
  }
});

test('Each two-state operation flips, and kinds in one group are aligned independently', () => {
  const cases = [
    ['asparagus', 'fuelEnabled'],
    ['asparagus', 'fuelCrossfeed'],
    ['asparagus', 'gimbalEnabled'],
    ['asparagus', 'controlEnabled'],
    ['rover', 'reactionEnabled'],
    ['rover', 'steeringEnabled'],
    ['rover', 'driveEnabled'],
    ['transport-cargo', 'cargoOpen'],
    ['asparagus', 'observation']
  ];
  const covered = new Set(['engine']);
  for (const [kind, operation] of cases) {
    const parts = preset(kind),
      spec = OPERATIONS.find(o => o.id === operation),
      targets = parts.filter(p => spec.applies(PARTS[p.type]));
    assert.ok(targets.length, kind + ' has no part for ' + operation);
    for (const p of targets) setOperationGroups(p, operation, [4]);
    const f = new Flight(parts, kind === 'rover' ? 'land' : 'orbit');
    try {
      const before = targets.map(p => isOn(f, p.id, operation)),
        expected = !before.some(Boolean);
      const r = fireActionGroup(f, 4);
      assert.deepEqual(
        r.ran,
        [{operation, on: expected, count: before.filter(on => on !== expected).length}],
        operation
      );
      assert.ok(
        targets.every(p => isOn(f, p.id, operation) === expected),
        operation
      );
      assert.equal(groupNotice(4, r.ran).includes(expected ? spec.on : spec.off), true);
      fireActionGroup(f, 4);
      assert.ok(
        targets.every(p => isOn(f, p.id, operation) === !expected),
        operation + ' flips back'
      );
      covered.add(operation);
    } finally {
      f.dispose();
    }
  }
  assert.deepEqual(
    OPERATIONS.filter(o => o.kind === 'toggle' && !covered.has(o.id)).map(o => o.id),
    []
  );
  // Engines (all off) and gimbals (all on) in one group: engines start while gimbals switch off.
  const {parts, engines} = boosters();
  for (const p of engines) setOperationGroups(p, 'gimbalEnabled', [1]);
  const f = new Flight(parts, 'land');
  try {
    const r = fireActionGroup(f, 1);
    assert.deepEqual(r.ran, [
      {operation: 'engine', on: true, count: 2},
      {operation: 'gimbalEnabled', on: false, count: 2}
    ]);
    assert.equal(groupNotice(1, r.ran), 'グループ1：エンジン始動 ×2 · ジンバル 切 ×2');
  } finally {
    f.dispose();
  }
});

test('A part that refuses does not stop the others', () => {
  const {parts, engines} = boosters(),
    f = new Flight(parts, 'land');
  try {
    f.thermal.get(engines[0].id).failed = true;
    const r = fireActionGroup(f, 1);
    assert.deepEqual(r.ran, [{operation: 'engine', on: true, count: 1}]);
    assert.ok(!f.active.has(engines[0].id) && f.active.has(engines[1].id));
  } finally {
    f.dispose();
  }
});

test('Separation runs once, keeps the assignments on the dropped boosters, and is skipped afterwards', () => {
  const {parts, rings, engines} = boosters(),
    f = new Flight(parts, 'land');
  try {
    const count = f.parts.length;
    let r = fireActionGroup(f, 2);
    assert.deepEqual(r.ran, [{operation: 'decouple', on: null, count: 2}]);
    assert.equal(r.separated, true);
    assert.equal(r.flight, f);
    assert.equal(f.detached.length, 2);
    assert.ok(f.parts.length < count);
    assert.equal(groupNotice(2, r.ran), 'グループ2：切離し ×2');
    // The boosters carry their own assignments; the core has none left.
    assert.deepEqual(groupRows(f.parts), []);
    for (const child of f.detached) {
      assert.deepEqual(groupRows(child.parts), [
        {group: 1, summary: 'エンジン'},
        {group: 2, summary: '切離し'}
      ]);
      assert.ok(child.parts.some(p => rings.some(q => q.id === p.id)));
      assert.ok(child.parts.some(p => engines.some(q => q.id === p.id)));
      // A dropped booster has no control: firing on it does nothing.
      const none = fireActionGroup(child, 1);
      assert.deepEqual([none.assigned, none.ran, none.separated], [0, [], false]);
      assert.equal(child.active.size, 0);
    }
    r = fireActionGroup(f, 2);
    assert.deepEqual([r.assigned, r.ran, r.separated], [0, [], false]);
    const g = loadFlight(JSON.parse(JSON.stringify(saveFlight(f))));
    assert.deepEqual(
      g.detached.map(v => groupRows(v.parts).length),
      [2, 2]
    );
    g.dispose();
  } finally {
    f.dispose();
  }
});

test('Staging keeps the assignments of the parts that stay and of those that leave', () => {
  const {parts} = boosters(),
    f = new Flight(parts, 'land');
  try {
    f.stageNext();
    f.stageNext();
    assert.equal(f.detached.length, 2);
    assert.deepEqual(
      f.detached.map(v => groupRows(v.parts).map(r => r.group)),
      [
        [1, 2],
        [1, 2]
      ]
    );
  } finally {
    f.dispose();
  }
});

test('Parachute operations run where offered and are skipped elsewhere', () => {
  const parts = preset('recovery'),
    chute = parts.find(p => PARTS[p.type].parachute);
  setOperationGroups(chute, 'chuteArm', [1]);
  setOperationGroups(chute, 'chuteDisarm', [2]);
  setOperationGroups(chute, 'chuteCut', [3]);
  const f = new Flight(parts, 'orbit');
  try {
    const state = f.chutes.get(chute.id);
    assert.equal(state.status, 'stowed');
    assert.deepEqual(fireActionGroup(f, 2).ran, [], 'nothing to disarm');
    assert.deepEqual(fireActionGroup(f, 3).ran, [], 'nothing to cut');
    assert.deepEqual(fireActionGroup(f, 1).ran, [{operation: 'chuteArm', on: null, count: 1}]);
    assert.equal(state.status, 'armed');
    assert.deepEqual(fireActionGroup(f, 1).ran, [], 'already armed');
    assert.deepEqual(fireActionGroup(f, 2).ran, [{operation: 'chuteDisarm', on: null, count: 1}]);
    assert.equal(state.status, 'stowed');
    state.status = 'open';
    const r = fireActionGroup(f, 3);
    assert.deepEqual(r.ran, [{operation: 'chuteCut', on: null, count: 1}]);
    assert.equal(state.status, 'cut');
    assert.equal(groupNotice(3, r.ran), 'グループ3：パラシュート切離し');
  } finally {
    f.dispose();
  }
});

test('Undocking splits the vessel, each half keeps its assignments, docking merges them again', () => {
  const parts = preset('docking'),
    ports = parts.filter(p => PARTS[p.type].docking),
    probes = parts.filter(p => p.type === 'probe');
  assert.equal(ports.length, 2);
  setOperationGroups(ports[0], 'undock', [9]);
  setOperationGroups(ports[1], 'undock', [9]);
  setOperationGroups(probes[0], 'reactionEnabled', [6]);
  setOperationGroups(probes[1], 'reactionEnabled', [6]);
  let f = new Flight(parts, 'orbit');
  try {
    assert.deepEqual(groupRows(f.parts), [
      {group: 6, summary: 'リアクションホイール×2'},
      {group: 9, summary: 'ポート分離×2'}
    ]);
    // One vessel while docked: the group reaches the parts of both halves.
    assert.deepEqual(fireActionGroup(f, 6).ran, [{operation: 'reactionEnabled', on: false, count: 2}]);
    const r = fireActionGroup(f, 9);
    // Both ports are in the group; the first undocks the pair, the second has nothing left to undock.
    assert.deepEqual(r.ran, [{operation: 'undock', on: null, count: 1}]);
    assert.equal(r.separated, true);
    assert.notEqual(r.flight, f);
    f = r.flight;
    assert.equal(f.detached.length, 1);
    const other = f.detached[0];
    for (const v of [f, other])
      assert.deepEqual(groupRows(v.parts), [
        {group: 6, summary: 'リアクションホイール'},
        {group: 9, summary: 'ポート分離'}
      ]);
    assert.deepEqual(fireActionGroup(f, 9).ran, [], 'not docked any more');
    // After undocking, a group acts on the piloted half only.
    assert.deepEqual(fireActionGroup(f, 6).ran, [{operation: 'reactionEnabled', on: true, count: 1}]);
    assert.equal(other.parts.find(p => p.type === 'probe').reactionEnabled, false);
    const own = f.parts.find(p => PARTS[p.type].docking),
      theirs = other.parts.find(p => PARTS[p.type].docking);
    other.vel.copy(f.vel);
    f.omega.set(0, 0, 0);
    other.omega.set(0, 0, 0);
    f = dockVessels(f, other, own.id, theirs.id);
    assert.deepEqual(groupRows(f.parts), [
      {group: 6, summary: 'リアクションホイール×2'},
      {group: 9, summary: 'ポート分離×2'}
    ]);
    // Mixed after the merge (one on, one off): aligned to off.
    assert.deepEqual(fireActionGroup(f, 6).ran, [{operation: 'reactionEnabled', on: false, count: 1}]);
  } finally {
    f.dispose();
  }
});

test('Firing on a vessel that cannot be controlled does nothing', () => {
  const {parts, engines} = boosters(),
    f = new Flight(parts, 'land');
  try {
    f.crashed = true;
    for (const group of [1, 2]) {
      const r = fireActionGroup(f, group);
      assert.deepEqual([r.assigned, r.ran, r.separated, r.flight], [0, [], false, f]);
    }
    assert.equal(f.active.size, 0);
    assert.equal(f.detached.length, 0);
    assert.ok(engines.every(p => f.parts.some(q => q.id === p.id)));
  } finally {
    f.dispose();
  }
});

test('An example with groups added is still that example for the play statistics', () => {
  const {parts} = boosters();
  assert.equal(exampleId(preset('asparagus'), examples.asparagus[3]), 'asparagus');
  assert.equal(exampleId(parts, examples.asparagus[3]), 'asparagus');
});

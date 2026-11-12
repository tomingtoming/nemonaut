import test from 'node:test';
import assert from 'node:assert/strict';
import {PARTS, preset} from '../dist/catalog.js';
import {examples} from '../dist/examples.js';
import {Flight, validateCraft} from '../dist/core.js';
import {saveCraft, loadCraft} from '../dist/craft-save.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {
  createFuel,
  fuelNetworks,
  engineBurn,
  stagePerformance,
  stageDrain,
  usesTankPropellant,
  engineMaxThrust,
  engineIsp,
  vacuumIsp
} from '../dist/resources.js';
import {stageFuelLevels, separationFuelLevels, separationDue} from '../dist/stage-fuel.js';
import {partSettings, validPartSetting} from '../dist/part-settings.js';
import {partActions, setPartAction, engineState} from '../dist/part-actions.js';
import {editSymmetrySetting} from '../dist/symmetry.js';
import {transferTargets, transferFuel} from '../dist/fuel-transfer.js';
import {stageThrustDiagnostics} from '../dist/design-diagnostics.js';
import {LaunchPilot} from '../dist/launch-pilot.js';
import {exampleId} from '../dist/metrics.js';

const G = 9.81;
// A bare tree of tanks, engines and separators: [id, type, parent, stage, extra fields].
const craft = rows =>
  rows.map(([id, type, parent = null, stage = 0, extra = {}]) => ({
    id,
    type,
    parent,
    stage,
    p: [0, 0, 0],
    r: [0, 0, 0],
    ...extra
  }));
// core ← A ← B, each cell one tank and one engine, separators crossfeeding unless stated.
const chain = ({a = true, b = true} = {}) =>
  craft([
    ['probe', 'probe'],
    ['coreTank', 'tank', 'probe'],
    ['coreEngine', 'engine', 'coreTank'],
    ['ringA', 'decoupler', 'coreTank', 2, a === null ? {} : {fuelCrossfeed: a}],
    ['tankA', 'tank', 'ringA'],
    ['engineA', 'engine', 'tankA'],
    ['ringB', 'decoupler', 'tankA', 1, b === null ? {} : {fuelCrossfeed: b}],
    ['tankB', 'tank', 'ringB'],
    ['engineB', 'engine', 'tankB']
  ]);
const levels = (fuel, ...ids) => ids.map(id => fuel.get(id));
const total = fuel => [...fuel.values()].reduce((s, n) => s + n, 0);
// Propellant the lit engines ask for in dt at full throttle (the kernel's need).
const demand = (parts, lit, dt, throttle = 1) =>
  parts
    .filter(p => lit.has(p.id))
    .reduce((s, p) => s + (engineMaxThrust(p) * throttle * dt) / (vacuumIsp(p) * G), 0);

// The supply grouping before separators could pass fuel: a separator always ends the walk.
function referenceNetworks(parts) {
  const byId = new Map(parts.map(p => [p.id, p])),
    groups = new Map(),
    network = new Map();
  for (const p of parts) {
    let root = p;
    for (
      let parent = root.parent ? byId.get(root.parent) : undefined;
      parent &&
      !PARTS[root.type].decoupler &&
      !(PARTS[root.type].docking && root.fuelCrossfeed === false) &&
      !(PARTS[parent.type].docking && parent.fuelCrossfeed === false);
      parent = root.parent ? byId.get(root.parent) : undefined
    )
      root = parent;
    let group = groups.get(root.id);
    if (!group) groups.set(root.id, (group = {parts: [], tanks: [], engines: []}));
    group.parts.push(p);
    if (PARTS[p.type].fuel && p.fuelEnabled !== false) group.tanks.push(p);
    if (usesTankPropellant(p)) group.engines.push(p);
    network.set(p.id, group);
  }
  return {groups: [...groups.values()], network};
}
// The sequential reference burn before crossfeed: every burning supply runs dry in its stage.
function referencePerformance(parts) {
  let remaining = structuredClone(parts);
  const propellant = createFuel(parts),
    active = new Set(),
    plan = [];
  for (const stage of [...new Set(parts.map(p => p.stage))].sort((a, b) => a - b)) {
    const removed = new Set(
      remaining.filter(p => p.parent && PARTS[p.type].decoupler && p.stage === stage).map(p => p.id)
    );
    for (let more = true; more;) {
      more = false;
      for (const p of remaining)
        if (removed.has(p.parent) && !removed.has(p.id)) {
          removed.add(p.id);
          more = true;
        }
    }
    remaining = remaining.filter(p => !removed.has(p.id));
    for (const p of remaining) if (p.stage === stage && usesTankPropellant(p)) active.add(p.id);
    const burning = referenceNetworks(remaining).groups.filter(
        g =>
          g.engines.some(e => active.has(e.id) && engineMaxThrust(e) > 0) &&
          g.tanks.some(t => (propellant.get(t.id) || 0) > 0)
      ),
      engines = burning.flatMap(g => g.engines.filter(e => active.has(e.id) && engineMaxThrust(e) > 0)),
      thrust = engines.reduce((s, p) => s + engineMaxThrust(p), 0);
    if (!thrust) continue;
    const before = remaining.reduce(
        (s, p) => s + PARTS[p.type].mass + (propellant.get(p.id) || 0) + (PARTS[p.type].ablator ?? 0),
        0
      ),
      fuel = burning.reduce((s, g) => s + g.tanks.reduce((n, p) => n + (propellant.get(p.id) || 0), 0), 0),
      isp = thrust / engines.reduce((s, p) => s + engineMaxThrust(p) / vacuumIsp(p), 0);
    plan.push({
      stage,
      thrust,
      mass: before,
      seaTwr:
        engines.reduce((s, p) => s + (engineMaxThrust(p) * engineIsp(p, 101325)) / vacuumIsp(p), 0) /
        (before * G),
      twr: thrust / (before * G),
      fuel,
      dv: isp * G * Math.log(before / Math.max(1, before - fuel))
    });
    for (const g of burning) for (const p of g.tanks) propellant.set(p.id, 0);
  }
  return plan;
}
const groupIds = networks =>
  networks.groups.map(g => [g.parts.map(p => p.id), g.tanks.map(p => p.id), g.engines.map(p => p.id)]);

test('A separator passes fuel only when switched on, and the supply lists its tanks outermost first', () => {
  for (const off of [null, false]) {
    const parts = chain({a: off, b: off}),
      networks = fuelNetworks(parts);
    assert.equal(networks.groups.length, 3);
    assert.ok(networks.groups.every(g => !g.tiers));
    assert.deepEqual(groupIds(networks), groupIds(referenceNetworks(parts)));
  }
  const networks = fuelNetworks(chain());
  assert.equal(networks.groups.length, 1);
  assert.deepEqual(
    networks.groups[0].tiers.map(t => t.map(p => p.id)),
    [['tankB'], ['tankA'], ['coreTank']]
  );
  // Only the outer ring passes fuel: A and B form one supply, the core keeps its own.
  const outer = fuelNetworks(chain({a: false}));
  assert.equal(outer.groups.length, 2);
  assert.equal(outer.network.get('coreEngine').tiers, undefined);
  assert.deepEqual(
    outer.network.get('engineA').tiers.map(t => t.map(p => p.id)),
    [['tankB'], ['tankA']]
  );
  // A crossfeeding separator with tanks on one side only has nothing to order.
  const oneSided = chain().filter(p => p.id !== 'coreTank' && p.id !== 'tankA');
  oneSided.find(p => p.id === 'coreEngine').parent = 'probe';
  oneSided.find(p => p.id === 'ringA').parent = 'probe';
  oneSided.find(p => p.id === 'engineA').parent = 'ringA';
  oneSided.find(p => p.id === 'ringB').parent = 'ringA';
  assert.equal(fuelNetworks(oneSided).groups.length, 1);
  assert.equal(fuelNetworks(oneSided).groups[0].tiers, undefined);
});

test('Every engine of a three-tier chain drains the outermost tank first, then the next, then the core', () => {
  for (const lit of [['coreEngine'], ['engineA'], ['engineB'], ['coreEngine', 'engineA', 'engineB']]) {
    const parts = chain(),
      networks = fuelNetworks(parts),
      fuel = createFuel(parts),
      active = new Set(lit),
      need = demand(parts, active, 1),
      order = ['tankB', 'tankA', 'coreTank'];
    let steps = 0;
    for (let stage = 0; stage < 3; steps++) {
      const before = new Map(fuel),
        thrust = engineBurn(networks, fuel, active, 1, 0, 1, 0),
        drawn = total(before) - total(fuel);
      // Propellant leaves exactly as fast as the lit engines consume it, and never appears.
      assert.ok(Math.abs(drawn - Math.min(need, total(before))) < 1e-9, lit + ' step ' + steps);
      for (const id of order) assert.ok(fuel.get(id) <= before.get(id));
      // Inner tanks stay full until everything outboard of them is empty.
      for (const [i, id] of order.entries())
        if (order.slice(0, i).some(outer => fuel.get(outer) > 0)) assert.equal(fuel.get(id), 1800);
      // No thrust gap at a tier change: thrust stays full while any tier holds enough.
      if (total(before) >= need)
        for (const id of lit) assert.equal(thrust.get(id), 45000, lit + ' step ' + steps);
      while (stage < 3 && fuel.get(order[stage]) === 0) stage++;
    }
    assert.equal(total(fuel), 0);
    assert.ok(steps >= Math.floor(5400 / need));
    // Flame-out only now that every tier is empty.
    const dry = engineBurn(networks, fuel, active, 1, 0, 1, 0);
    for (const id of lit) assert.equal(dry.get(id), 0);
  }
});

test('One step can finish a tier and continue on the next; a short supply scales thrust once', () => {
  const parts = chain({b: false}).filter(p => !['ringB', 'tankB', 'engineB'].includes(p.id)),
    networks = fuelNetworks(parts),
    active = new Set(['coreEngine', 'engineA']),
    need = demand(parts, active, 1),
    fuel = createFuel(parts);
  fuel.set('tankA', need / 4);
  let thrust = engineBurn(networks, fuel, active, 1, 0, 1, 0);
  assert.deepEqual([...thrust.values()], [45000, 45000]);
  assert.equal(fuel.get('tankA'), 0);
  assert.ok(Math.abs(fuel.get('coreTank') - (1800 - (need * 3) / 4)) < 1e-9);
  // Less than one step of propellant in both tiers together: both empty, thrust in proportion.
  fuel.set('tankA', need / 4);
  fuel.set('coreTank', need / 4);
  thrust = engineBurn(networks, fuel, active, 1, 0, 1, 0);
  assert.deepEqual(levels(fuel, 'tankA', 'coreTank'), [0, 0]);
  for (const n of thrust.values()) assert.ok(Math.abs(n - 22500) < 1e-6);
  // Throttle zero draws nothing.
  const full = createFuel(parts);
  engineBurn(networks, full, active, 0, 0, 1, 0);
  assert.deepEqual(levels(full, 'tankA', 'coreTank'), [1800, 1800]);
});

test('Disabled tanks are skipped, and symmetric boosters share their tier by content', () => {
  const parts = craft([
      ['probe', 'probe'],
      ['coreTank', 'tank', 'probe'],
      ['coreEngine', 'engine', 'coreTank'],
      ['ringL', 'decoupler', 'coreTank', 1, {fuelCrossfeed: true}],
      ['tankL', 'tank', 'ringL'],
      ['spareL', 'tank', 'tankL', 0, {fuelEnabled: false}],
      ['engineL', 'engine', 'tankL'],
      ['ringR', 'decoupler', 'coreTank', 1, {fuelCrossfeed: true}],
      ['tankR', 'tank', 'ringR', 0, {fuelLoad: 0.5}],
      ['engineR', 'engine', 'tankR']
    ]),
    networks = fuelNetworks(parts),
    fuel = createFuel(parts),
    active = new Set(['coreEngine', 'engineL', 'engineR']),
    need = demand(parts, active, 1);
  assert.deepEqual(
    networks.groups[0].tiers.map(t => t.map(p => p.id)),
    [['tankL', 'tankR'], ['coreTank']]
  );
  engineBurn(networks, fuel, active, 1, 0, 1, 0);
  // Same rule as within a plain supply: each tank of the tier gives in proportion to what it holds.
  assert.ok(Math.abs(fuel.get('tankL') - 1800 * (1 - need / 2700)) < 1e-9);
  assert.ok(Math.abs(fuel.get('tankR') - 900 * (1 - need / 2700)) < 1e-9);
  assert.deepEqual(levels(fuel, 'spareL', 'coreTank'), [1800, 1800]);
  for (let i = 0; i < 400; i++) engineBurn(networks, fuel, active, 1, 0, 1, 0);
  assert.deepEqual(levels(fuel, 'tankL', 'tankR', 'coreTank'), [0, 0, 0]);
  assert.equal(fuel.get('spareL'), 1800);
  // Switching the outer tanks off leaves a single tier: the supply behaves like a plain one.
  for (const id of ['tankL', 'tankR']) parts.find(p => p.id === id).fuelEnabled = false;
  assert.equal(fuelNetworks(parts).groups[0].tiers, undefined);
  assert.deepEqual(
    fuelNetworks(parts).groups[0].tanks.map(p => p.id),
    ['coreTank']
  );
});

test('With crossfeed absent or off every example keeps its supplies, burn and stage figures', () => {
  for (const id of Object.keys(examples))
    for (const mode of ['as built', 'absent', 'off']) {
      const parts = preset(id);
      if (mode !== 'as built')
        for (const p of parts)
          if (PARTS[p.type].decoupler) {
            if (mode === 'off') p.fuelCrossfeed = false;
            else delete p.fuelCrossfeed;
          }
      if (mode === 'as built' && parts.some(p => PARTS[p.type].decoupler && p.fuelCrossfeed)) continue;
      const networks = fuelNetworks(parts),
        reference = referenceNetworks(parts),
        label = id + ' ' + mode;
      assert.deepEqual(groupIds(networks), groupIds(reference), label);
      assert.ok(
        networks.groups.every(g => !g.tiers),
        label
      );
      assert.deepEqual(stagePerformance(parts), referencePerformance(parts), label);
      assert.equal(separationFuelLevels(parts).size, 0, label);
      for (const g of networks.groups) assert.equal(stageDrain(g, parts, createFuel(parts), 0), g.tanks);
      // Burn every engine for a while on both groupings: identical thrust and tank contents.
      const active = new Set(parts.filter(p => PARTS[p.type].thrust).map(p => p.id)),
        fuel = createFuel(parts),
        expected = createFuel(parts);
      for (const [density, dt] of [
        [1.225, 0.5],
        [0.3, 7],
        [0, 2000]
      ]) {
        const thrust = engineBurn(networks, fuel, active, 0.8, density, dt),
          old = engineBurn(reference, expected, active, 0.8, density, dt);
        assert.deepEqual([...thrust], [...old], label);
        assert.deepEqual([...fuel], [...expected], label);
      }
    }
});

test('Reference performance of an asparagus rocket matches the hand computation and beats no crossfeed', () => {
  const parts = preset('asparagus'),
    twin = structuredClone(parts);
  for (const p of twin) delete p.fuelCrossfeed;
  const dry = type => PARTS[type].mass,
    booster = 2 * dry('tank') + dry('engineSeaMedium') + dry('nose') + dry('fin') + dry('decouplerSmall'),
    core = dry('probe') + 2 * dry('tank') + dry('engineSeaMedium') + 2 * dry('fin'),
    m0 = core + 2 * booster + 6 * 1800,
    isp = 320;
  assert.equal(m0, 13670);
  // No crossfeed: the three stacks burn side by side and nothing is dropped before burnout.
  const single = isp * G * Math.log(m0 / (m0 - 10800));
  const plain = stagePerformance(twin);
  assert.equal(plain.length, 1);
  assert.ok(Math.abs(plain[0].dv - single) < 1e-9);
  // Crossfeed: three engines empty the booster tanks (7200 kg), the empty boosters are dropped, and
  // the core burns its own 3600 kg alone.
  const first = isp * G * Math.log(m0 / (m0 - 7200)),
    m1 = core + 3600,
    second = isp * G * Math.log(m1 / (m1 - 3600)),
    plan = stagePerformance(parts);
  assert.deepEqual(
    plan.map(p => [p.stage, p.thrust, p.mass, p.fuel]),
    [
      [0, 270000, m0, 7200],
      [1, 90000, m1, 3600]
    ]
  );
  assert.ok(Math.abs(plan[0].dv - first) < 1e-9);
  assert.ok(Math.abs(plan[1].dv - second) < 1e-9);
  assert.ok(Math.abs(plan[0].twr - 270000 / (m0 * G)) < 1e-12);
  assert.ok(Math.abs(plan[1].twr - 90000 / (m1 * G)) < 1e-12);
  const gain = first + second - single;
  assert.ok(gain > 2200 && gain < 2300, String(gain));
  assert.equal(Math.round(single), 4900);
  assert.equal(Math.round(first + second), 7139);
  // Three tiers: stage 1 drops B, stage 2 drops A; each stage burns exactly the tier it is about to drop.
  assert.deepEqual(
    stagePerformance(chain()).map(p => [p.stage, p.thrust, p.fuel]),
    [
      [0, 135000, 1800],
      [1, 90000, 1800],
      [2, 45000, 1800]
    ]
  );
  // In flight with the booster tanks already empty, nothing is left to burn before the separation.
  const fuel = createFuel(parts);
  for (const t of fuelNetworks(parts).groups[0].tiers[0]) fuel.set(t.id, 0);
  const late = stagePerformance(parts, fuel);
  assert.deepEqual(
    late.map(p => [p.stage, p.fuel, p.dv]),
    [
      [0, 0, 0],
      [1, 3600, second]
    ]
  );
  // The thrust-balance forecast follows the same drain: the core still burns after each separation.
  const balance = stageThrustDiagnostics(parts);
  assert.deepEqual(
    balance.stages.map(s => [
      s.stage,
      s.full.engineIds.length,
      s.engineStates.some(e => e.reasons.includes('fuel'))
    ]),
    [
      [0, 3, false],
      [1, 1, false]
    ]
  );
  assert.ok(balance.stages[1].full.mass === m1);
});

test('The crossfeed switch is a separator setting: default off, symmetry-linked, validated and saved', () => {
  const parts = preset('asparagus'),
    rings = parts.filter(p => p.type === 'decouplerSmall'),
    tank = parts.find(p => p.type === 'tank');
  for (const type of ['decoupler', 'decouplerSmall', 'decouplerLarge']) {
    const row = partSettings({id: 'x', type, parent: null, stage: 0, p: [0, 0, 0], r: [0, 0, 0]}).find(
      s => s.key === 'fuelCrossfeed'
    );
    assert.deepEqual([row.label, row.type, row.value], ['燃料通過', 'boolean', false], type);
  }
  assert.equal(partSettings(rings[0]).find(s => s.key === 'fuelCrossfeed').value, true);
  assert.equal(
    partSettings(preset('docking').find(p => p.type === 'dockingPort')).find(s => s.key === 'fuelCrossfeed')
      .value,
    true
  );
  assert.ok(validPartSetting(rings[0], 'fuelCrossfeed', false));
  assert.ok(!validPartSetting(rings[0], 'fuelCrossfeed', 1));
  assert.ok(!validPartSetting(tank, 'fuelCrossfeed', true));
  for (const p of rings) p.symmetryGroup = 'boosters';
  const off = editSymmetrySetting(parts, rings[0].id, 'fuelCrossfeed', false);
  assert.ok(off.filter(p => p.type === 'decouplerSmall').every(p => p.fuelCrossfeed === false));
  assert.equal(fuelNetworks(off).groups.length, 3);
  const one = editSymmetrySetting(off, rings[1].id, 'fuelCrossfeed', true, false);
  assert.deepEqual(
    one.filter(p => p.type === 'decouplerSmall').map(p => p.fuelCrossfeed),
    [false, true]
  );
  assert.throws(() => editSymmetrySetting(parts, rings[0].id, 'fuelCrossfeed', 'on'));
  assert.throws(() => editSymmetrySetting(parts, tank.id, 'fuelCrossfeed', true));
  // Craft files keep the switch; malformed values and parts that cannot pass fuel are rejected.
  const loaded = loadCraft(JSON.parse(JSON.stringify(saveCraft(preset('asparagus'), 'Trident'))));
  assert.deepEqual(
    loaded.filter(p => p.fuelCrossfeed !== undefined).map(p => [p.type, p.fuelCrossfeed]),
    [
      ['decouplerSmall', true],
      ['decouplerSmall', true]
    ]
  );
  assert.equal(fuelNetworks(loaded).groups.length, 1);
  assert.equal(exampleId(loaded, 'land'), 'asparagus');
  assert.equal(exampleId(off, 'land'), 'custom');
  for (const value of ['true', 1, null]) {
    const bad = preset('asparagus');
    bad.find(p => p.type === 'decouplerSmall').fuelCrossfeed = value;
    assert.throws(() => validateCraft({version: 1, parts: bad}), String(value));
  }
  const bad = preset('asparagus');
  bad.find(p => p.type === 'tank').fuelCrossfeed = true;
  assert.throws(() => validateCraft({version: 1, parts: bad}));
});

test('In flight the switch regroups the supply, transfers cross the separator, and saves round-trip', () => {
  const f = new Flight(preset('asparagus'), 'orbit');
  let restored;
  try {
    const ring = f.parts.find(p => p.type === 'decouplerSmall'),
      coreTank = f.parts.find(p => p.type === 'tank'),
      boosterTank = f.parts.find(p => p.parent === ring.id),
      boosterEngine = f.parts.find(p => p.parent === boosterTank.id && PARTS[p.type].thrust);
    assert.equal(f.networks.groups.length, 1);
    assert.ok(partActions(f, ring.id).some(a => a.key === 'fuelCrossfeed' && a.on));
    assert.ok(transferTargets(f, coreTank.id).some(p => p.id === boosterTank.id));
    f.fuel.set(coreTank.id, 1000);
    assert.equal(transferFuel(f, boosterTank.id, coreTank.id, 500), 500);
    assert.deepEqual(levels(f.fuel, coreTank.id, boosterTank.id), [1500, 1300]);
    // The booster engine reports the merged supply, so it does not read as starved while the core feeds it.
    for (const t of f.networks.network.get(boosterEngine.id).tiers[0]) f.fuel.set(t.id, 0);
    f.stageNext();
    f.throttle = 1;
    assert.match(engineState(f, boosterEngine.id).status, /^(?!.*燃料切れ)/);
    const saved = JSON.parse(JSON.stringify(saveFlight(f)));
    restored = loadFlight(saved);
    assert.deepEqual(restored.parts, f.parts);
    assert.deepEqual(
      restored.networks.groups[0].tiers.map(t => t.map(p => p.id)),
      f.networks.groups[0].tiers.map(t => t.map(p => p.id))
    );
    assert.deepEqual([...restored.fuel], [...f.fuel]);
    // Switching one ring off in flight splits that booster from the supply at once.
    assert.ok(setPartAction(f, ring.id, 'fuelCrossfeed', false));
    assert.equal(f.networks.groups.length, 2);
    assert.ok(!transferTargets(f, coreTank.id).some(p => p.id === boosterTank.id));
    assert.equal(transferFuel(f, coreTank.id, boosterTank.id, 10), 0);
    assert.ok(setPartAction(f, ring.id, 'fuelCrossfeed', true));
    assert.equal(f.networks.groups.length, 1);
    assert.ok(!setPartAction(f, coreTank.id, 'fuelCrossfeed', true));
  } finally {
    f.dispose();
    restored?.dispose();
  }
});

test('A booster stage reads as spent when its own tanks are empty, not when the merged supply is', () => {
  const parts = preset('asparagus'),
    fuel = createFuel(parts),
    networks = fuelNetworks(parts),
    [outer, inner] = networks.groups[0].tiers;
  assert.deepEqual(separationFuelLevels(parts, fuel).get(1), {capacity: 7200, remaining: 7200});
  assert.equal(separationFuelLevels(parts, fuel).size, 1);
  assert.equal(separationDue(parts, fuel, 0), false);
  // The engine gauge of stage 0 shows the merged supply.
  assert.deepEqual(
    [stageFuelLevels(parts, fuel).get(0).capacity, stageFuelLevels(parts, fuel).get(0).remaining],
    [10800, 10800]
  );
  for (const t of outer) fuel.set(t.id, 0);
  assert.deepEqual(separationFuelLevels(parts, fuel).get(1), {capacity: 7200, remaining: 0});
  assert.equal(separationDue(parts, fuel, 0), true);
  assert.equal(separationDue(parts, fuel, 1), false);
  assert.equal(stageFuelLevels(parts, fuel).get(0).remaining, 3600);
  assert.equal(stageFuelLevels(parts, fuel).get(0).unfed, 0);
  assert.equal(inner.length, 2);
  // A booster tank switched off keeps its fuel out of the supply and out of the signal.
  const held = structuredClone(parts),
    heldFuel = createFuel(held);
  held.find(p => p.id === outer[0].id).fuelEnabled = false;
  assert.equal(separationFuelLevels(held, heldFuel).get(1).capacity, 5400);
  // A chain reports each separation by the tanks it discards; without crossfeed there is no signal.
  const three = chain(),
    threeFuel = createFuel(three);
  assert.deepEqual(
    [...separationFuelLevels(three, threeFuel)].map(([stage, l]) => [stage, l.capacity]).sort(),
    [
      [1, 1800],
      [2, 3600]
    ]
  );
  threeFuel.set('tankB', 0);
  assert.equal(separationDue(three, threeFuel, 0), true);
  assert.equal(separationDue(three, threeFuel, 1), false);
  assert.equal(separationFuelLevels(chain({a: false, b: false})).size, 0);
  assert.equal(separationDue(preset('launcher'), new Map(), 0), false);
});

test('The asparagus example flies to orbit, staged when the booster tanks are empty, conserving propellant', () => {
  const parts = preset('asparagus'),
    f = new Flight(parts, 'land'),
    pilot = new LaunchPilot();
  try {
    assert.equal(parts.length, 18);
    const boosterTanks = f.networks.groups[0].tiers[0].map(p => p.id),
      coreTanks = f.networks.groups[0].tiers[1].map(p => p.id);
    let previous = new Map(f.fuel),
      stagedAt = null,
      burned = 0;
    for (let i = 0; i < 600 * 120 && !pilot.done && !f.crashed; i++) {
      pilot.update(f);
      const stage = f.stage,
        lit = new Set([...f.active].filter(id => f.parts.some(p => p.id === id))),
        need = f.started ? demand(f.parts, lit, 1 / 120, f.throttle) : 0,
        held = f.parts.reduce((s, p) => s + (PARTS[p.type].fuel ? f.fuel.get(p.id) : 0), 0);
      if (stage === 1 && stagedAt === null) {
        // The pilot dropped the boosters on the signal: their tanks were empty, the core untouched.
        stagedAt = i;
        for (const id of boosterTanks) assert.ok(previous.get(id) < 0.001);
        for (const id of coreTanks) assert.ok(f.fuel.get(id) > 1790, String(f.fuel.get(id)));
        assert.equal(f.parts.length, 6);
        assert.equal(f.networks.groups.length, 1);
        assert.equal(f.networks.groups[0].tiers, undefined);
        previous = new Map(f.fuel);
      }
      f.step(1 / 120);
      const now = f.parts.reduce((s, p) => s + (PARTS[p.type].fuel ? f.fuel.get(p.id) : 0), 0);
      // Each step the tanks lose what the lit engines consume: nothing created, nothing lost.
      assert.ok(Math.abs(held - now - Math.min(need, held)) < 1e-9, 'step ' + i);
      burned += held - now;
      for (const p of f.parts)
        if (PARTS[p.type].fuel) assert.ok(f.fuel.get(p.id) <= previous.get(p.id) + 1e-12);
      if (stage === 0 && boosterTanks.some(id => f.fuel.get(id) > 0))
        for (const id of coreTanks) assert.equal(f.fuel.get(id), 1800);
      previous = new Map(f.fuel);
    }
    assert.ok(stagedAt !== null);
    assert.equal(pilot.done, true);
    assert.equal(f.crashed, false);
    assert.equal(f.stage, 1);
    assert.ok(f.orbit.periapsis > 74000);
    assert.ok(f.orbit.apoapsis < 200000);
    assert.ok(f.fuelRatio > 0.3);
    assert.ok(Math.abs(burned - (10800 - f.fuelRatio * 3600)) < 1e-6);
  } finally {
    f.dispose();
  }
  // The same rocket without crossfeed arrives with its boosters still attached and almost dry.
  const twin = preset('asparagus');
  for (const p of twin) delete p.fuelCrossfeed;
  const g = new Flight(twin, 'land'),
    plain = new LaunchPilot();
  try {
    for (let i = 0; i < 600 * 120 && !plain.done && !g.crashed; i++) {
      plain.update(g);
      g.step(1 / 120);
    }
    assert.equal(g.crashed, false);
    assert.equal(g.stage, 0);
    assert.ok(g.fuelRatio < 0.1);
  } finally {
    g.dispose();
  }
});

test('The automatic ascent drops the empty boosters of the asparagus example and reaches 90 km', async () => {
  const {AscentPrototype} = await import('../dist/ascent-prototype.js'),
    {ascentReadiness} = await import('../dist/ascent-readiness.js'),
    f = new Flight(preset('asparagus'), 'land'),
    pilot = new AscentPrototype({altitude: 90000});
  try {
    assert.equal(ascentReadiness(f), null);
    let core = null;
    for (let i = 0; i < 1200 * 120 && !pilot.done && !f.crashed; i++) {
      pilot.update(f);
      f.step(1 / 120);
      if (f.stage === 1 && core === null) core = [...f.fuel.values()];
    }
    assert.equal(pilot.phase, '周回達成');
    assert.equal(f.crashed, false);
    assert.equal(f.parts.length, 6);
    assert.ok(core.length === 2 && core.every(n => n > 1790));
    assert.ok(f.orbit.periapsis >= 88000 && f.orbit.apoapsis <= 92000);
    assert.ok(f.fuelRatio > 0.3);
  } finally {
    f.dispose();
  }
});

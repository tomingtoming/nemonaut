import {finiteReturnPlan} from '../dist/finite-return-plan.js';
import {WorldRuntime} from '../dist/world-runtime.js';
import {centerGuidance} from '../dist/center-facilities.js';
import {historyActionLabel} from '../dist/departure-mode.js';
import {recordOrbitAchievements} from '../dist/exploration-history.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';
import {LaunchPilot} from '../dist/launch-pilot.js';
import {AscentSession} from '../dist/ascent-session.js';
import {ManeuverSession} from '../dist/maneuver-session.js';
import {deorbitPlan} from '../dist/deorbit-plan.js';
import {createManeuverNode} from '../dist/maneuver-node.js';
import {centerOfVessel} from '../dist/relative-navigation.js';
import {loadFlight, saveFlight} from '../dist/flight-save.js';
import {fleet} from '../dist/fleet.js';
import {worldFromFlight, flightFromWorld} from '../dist/world-save.js';
import {launchWorld, selectWorldVessel, retireWorldVessel} from '../dist/world-operations.js';
import {editingParts, gameRecord, validateGame} from '../dist/game-save.js';

// Both vehicles actually depart from the rotating surface. Demonstration pilots
// use the same staging/throttle/SAS actuators; no positions or velocities are set.
// The ascents are flown once per file: every test continues from its own copy of the saved world.
let satelliteInOrbit = null;
function launchSatellite() {
  if (satelliteInOrbit) return satelliteInOrbit;
  let world = launchWorld(worldFromFlight(null), {
    parts: preset('launcher'),
    name: 'Satellite A',
    environment: 'land'
  });
  const aId = world.activeVesselId,
    f = loadFlight(flightFromWorld(world)),
    runtime = new WorldRuntime(f);
  try {
    const ascent = new LaunchPilot();
    for (let i = 0; i < 500 * 120 && !ascent.done && !f.crashed; i++) {
      ascent.update(f);
      runtime.replace(f);
      runtime.step(1 / 120);
    }
    assert.ok(ascent.done, 'A reaches orbit from ground');
    assert.ok(f.orbit.stable);
    assert.equal(f.crashed, false);
    const aFuel = [...f.fuel],
      aTime = f.time;
    const beforeHistory = structuredClone(world.history);
    const achieved = recordOrbitAchievements(world.history, f);
    assert.deepEqual(world.history, beforeHistory);
    assert.equal(achieved.at(-1).type, 'orbit');
    assert.equal(achieved.at(-1).vesselId, aId);
    assert.equal(recordOrbitAchievements(achieved, f), achieved);
    assert.equal(recordOrbitAchievements(world.history, f, {practice: true}), world.history);
    world.history = recordOrbitAchievements(world.history, f);
    world = worldFromFlight(saveFlight(f), {history: world.history});
    return (satelliteInOrbit = {world, aId, aFuel, aTime});
  } finally {
    f.dispose();
  }
}
// B launched at the epoch A reached, flown to orbit and saved. The two LaunchPilot modes share one ascent.
const returnerInOrbit = new Map();
function launchReturner(automatic) {
  const known = returnerInOrbit.get(automatic);
  if (known) return known;
  const {world: prior, aId} = launchSatellite(),
    draft = {parts: preset('returner'), name: 'Return B', bay: 'vab', environment: 'land'};
  let world = launchWorld(structuredClone(prior), draft);
  const bId = world.activeVesselId;
  assert.deepEqual(
    world.vessels.find(v => v.vesselId === aId).pos,
    prior.vessels.find(v => v.vesselId === aId).pos
  );
  const f = loadFlight(flightFromWorld(world)),
    runtime = new WorldRuntime(f);
  try {
    const launchTime = f.universalTime,
      launch = automatic ? new AscentSession() : new LaunchPilot();
    if (automatic) launch.start(f, {altitude: 120000, inclination: 90});
    assert.ok(launchTime > 100, 'B begins at the epoch reached by A');
    for (let i = 0; i < 1200 * 120 && (automatic ? launch.owner : !launch.done) && !f.crashed; i++) {
      if (automatic) launch.step(f, 1 / 120);
      else launch.update(f);
      runtime.replace(f);
      runtime.step(1 / 120);
    }
    assert.ok(
      automatic ? launch.state === 'complete' : launch.done,
      'B reaches orbit from ground at the later epoch'
    );
    assert.ok(f.orbit.stable);
    assert.equal(f.crashed, false);
    world.history = recordOrbitAchievements(world.history, f);
    world = worldFromFlight(saveFlight(f), {history: world.history});
    const saved = {world, bId, draft};
    returnerInOrbit.set(automatic, saved);
    return saved;
  } finally {
    f.dispose();
  }
}
// The re-entry, recovery and reload after the burn do not depend on how the burn was planned
// (world-mission flies them too), so one mode flies them and the others end at the periapsis.
for (const mode of ['instantaneous', 'corrected', 'automatic']) {
  const finite = mode !== 'instantaneous',
    automatic = mode === 'automatic',
    recovers = automatic;
  test(
    recovers
      ? `surface-launched A survives B ${mode} planned return, recovery and reload`
      : `surface-launched B ${mode} planned return burn reaches the planned periapsis after a saved node`,
    t => {
      const {aId, aFuel, aTime} = launchSatellite(),
        saved = launchReturner(automatic),
        bId = saved.bId,
        draft = structuredClone(saved.draft);
      let world = structuredClone(saved.world),
        runtime,
        f = null;
      try {
        world = selectWorldVessel(world, aId).world;
        world = validateGame(JSON.parse(JSON.stringify(gameRecord({world, draft})))).world;
        assert.equal(world.activeVesselId, aId);
        world = selectWorldVessel(world, bId).world;
        f = loadFlight(flightFromWorld(world));
        runtime = new WorldRuntime(f);
        const plan = finite
          ? finiteReturnPlan(f, {throttle: 0.1})
          : deorbitPlan(centerOfVessel(f), f.vel, f.universalTime);
        const expectedPeriapsis = finite ? plan.prediction.orbit.periapsis : plan.preview.orbit.periapsis;
        f.maneuver = createManeuverNode(
          plan.preview,
          f.time,
          automatic ? {plannedThrottle: plan.throttle} : {}
        );
        f.maneuver.stopAtTarget = true;
        f.maneuver.tolerance = 0.05;
        f.sas = true;
        f.sasMode = 'maneuver';
        // Save/reload the scheduled node before executing it, as during a real session.
        world = worldFromFlight(saveFlight(f), {history: world.history});
        f.dispose();
        f = loadFlight(flightFromWorld(world));
        runtime = new WorldRuntime(f);
        let burnStart;
        if (automatic) {
          const maneuver = new ManeuverSession();
          maneuver.start(f);
          burnStart = maneuver.plan.startTime;
          for (let i = 0; i < 300 * 120 && maneuver.owner; i++) {
            maneuver.step(f, 1 / 120);
            runtime.replace(f);
            runtime.step(1 / 120);
          }
          assert.equal(maneuver.state, 'complete', maneuver.message);
        } else {
          while (f.universalTime < plan.location.universalTime)
            runtime.step(Math.min(1 / 120, plan.location.universalTime - f.universalTime));
          burnStart = f.universalTime;
          for (let i = 0; i < 120 * 180 && !f.maneuver.complete && !f.crashed; i++) {
            f.throttle = 0.1;
            runtime.step(1 / 120);
          }
        }
        assert.equal(f.maneuver.complete, true);
        assert.equal(f.throttle, 0);
        assert.equal(f.crashed, false);
        const actualPeriapsis = f.orbit.periapsis;
        assert.ok(Math.abs(actualPeriapsis - expectedPeriapsis) < 100, `actual periapsis ${actualPeriapsis}`);
        t.diagnostic(
          JSON.stringify({
            plannedDeltaV: plan.preview.impulse.length(),
            burnDuration: f.universalTime - burnStart,
            plannedPeriapsis: expectedPeriapsis,
            actualPeriapsis
          })
        );
        if (!recovers) return;
        f.stageNext();
        f.armParachutes();
        let opened = false;
        for (let i = 0; i < 3000 * 60 && !f.landed && !f.crashed; i++) {
          f.sasMode = f.vel.length() > 300 ? 'retrograde' : 'radial';
          runtime.replace(f);
          runtime.step(1 / 60);
          opened ||= [...f.chutes.values()].some(c => c.status === 'open');
        }
        assert.ok(opened);
        assert.ok(f.landed);
        assert.equal(f.crashed, false);
        assert.equal(f.parts.length, 3);
        const a = fleet(f).find(v => v.vesselId === aId);
        assert.ok(a, 'A remains in world');
        assert.ok(a.orbit.stable);
        assert.equal(a.crashed, false);
        assert.ok(a.time > aTime);
        assert.deepEqual([...a.fuel], aFuel);
        assert.ok(fleet(f).every(v => v.universalTime === f.universalTime));
        world.history = recordOrbitAchievements(world.history, f);
        world = worldFromFlight(saveFlight(f), {history: world.history});
        f.dispose();
        f = null;
        world = selectWorldVessel(world, aId).world;
        const aBefore = structuredClone(world.vessels.find(v => v.vesselId === aId)),
          count = world.vessels.length;
        const recovered = retireWorldVessel(world, bId, 'recover');
        assert.equal(recovered.world.vessels.length, count - 1);
        assert.equal(recovered.removed.action, '回収');
        const game = validateGame(JSON.parse(JSON.stringify(gameRecord({world: recovered.world, draft}))));
        assert.deepEqual({...game.workshop, parts: editingParts(game)}, JSON.parse(JSON.stringify(draft)));
        assert.equal(game.world.activeVesselId, aId);
        assert.ok(!game.world.vessels.some(v => v.vesselId === bId));
        assert.deepEqual(
          game.world.history.map(e => e.type),
          ['launch', 'orbit', 'launch', 'orbit', 'recover']
        );
        assert.equal(game.world.history.at(-1).vesselId, bId);
        const returnEvent = game.world.history.at(-1),
          orbitEvent = game.world.history.find(e => e.type === 'orbit' && e.vesselId === bId);
        assert.equal(returnEvent.bodyId, 'planet');
        assert.deepEqual(returnEvent.orbitEventIds, [orbitEvent.id]);
        assert.equal(returnEvent.partIds.length, 3);
        assert.match(historyActionLabel(returnEvent), /軌道から帰還/);
        const guide = centerGuidance({
          history: game.world.history,
          partCount: draft.parts.length,
          designCount: 1,
          vesselCount: game.world.vessels.length
        });
        assert.ok(guide.slice(0, 3).every(step => step.completed));
        assert.ok(guide.slice(3).every(step => !step.completed));
        assert.match(guide[2].text, /Return B/);
        const aAfter = game.world.vessels.find(v => v.vesselId === aId);
        for (const key of ['vesselId', 'pos', 'vel', 'fuel', 'charge', 'thermal', 'state', 'universalTime'])
          assert.deepEqual(aAfter[key], aBefore[key]);
        f = loadFlight(flightFromWorld(game.world));
        assert.ok(f.orbit.stable);
        assert.equal(f.vesselId, aId);
        t.diagnostic(
          JSON.stringify({
            universalTime: game.world.universalTime,
            satellitePeriapsis: f.orbit.periapsis,
            satelliteApoapsis: f.orbit.apoapsis,
            retainedVessels: game.world.vessels.length,
            recovered: recovered.removed.name,
            parachuteOpened: opened
          })
        );
      } finally {
        f?.dispose();
      }
    }
  );
}

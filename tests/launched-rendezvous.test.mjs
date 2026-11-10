import {ManeuverSession} from '../dist/maneuver-session.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {preset} from '../dist/catalog.js';
import {LaunchPilot} from '../dist/launch-pilot.js';
import {WorldRuntime} from '../dist/world-runtime.js';
import {launchWorld, selectWorldVessel} from '../dist/world-operations.js';
import {worldFromFlight, flightFromWorld} from '../dist/world-save.js';
import {saveFlight, loadFlight} from '../dist/flight-save.js';
import {relativeState, centerOfVessel, setTarget, selectDockingPorts} from '../dist/relative-navigation.js';
import {bodyOrbitState} from '../dist/celestial.js';
import {timedRendezvousTransfer, timedRelativeStopPlan, transferThrottle} from '../dist/timed-rendezvous.js';
import {rendezvousTransfer} from '../dist/rendezvous-transfer.js';
import {maneuverPreview} from '../dist/maneuver.js';
import {keplerDrift} from '../dist/coast-orbit.js';
import {createManeuverNode} from '../dist/maneuver-node.js';
import {portGuidance} from '../dist/port-navigation.js';
import {dockingStatus, dockVessels, undockVessel} from '../dist/docking.js';
import {setPartAction} from '../dist/part-actions.js';

for (const automatic of [false, true])
  test(`two surface launches ${automatic ? 'automatically' : 'manually'} rendezvous, dock, refuel, separate and resume independently`, () => {
    let world = worldFromFlight(null),
      firstId,
      firstFuel,
      firstTime;
    for (let n = 0; n < 2; n++) {
      world = launchWorld(world, {
        parts: preset('tug-launcher'),
        environment: 'land',
        name: 'Tug ' + (n + 1)
      });
      let f = loadFlight(flightFromWorld(world));
      const runtime = new WorldRuntime(f),
        pilot = new LaunchPilot();
      try {
        for (let i = 0; i < 600 * 120 && !pilot.done && !f.crashed; i++) {
          pilot.update(f);
          runtime.replace(f);
          runtime.step(1 / 120);
        }
        assert.equal(pilot.phase, '周回達成');
        assert.equal(f.crashed, false);
        assert.equal(f.stage, 1);
        assert.ok(f.orbit.periapsis > 75000);
        if (!n) {
          firstId = f.vesselId;
          firstFuel = [...f.fuel];
          firstTime = f.universalTime;
        } else {
          const target = runtime.vessels.get(firstId);
          assert.ok(target);
          assert.notEqual(target.vesselId, f.vesselId);
          assert.equal(target.universalTime, f.universalTime);
          assert.ok(target.universalTime > firstTime + 290);
          assert.deepEqual([...target.fuel], firstFuel);
          assert.ok(target.orbit.periapsis > 74000);
          assert.ok(relativeState(f, target).distance > 500000);
          const own = bodyOrbitState(centerOfVessel(f), f.vel, f.universalTime),
            other = bodyOrbitState(centerOfVessel(target), target.vel, target.universalTime);
          assert.throws(() => rendezvousTransfer(own, other, {duration: 600}));
          const plan = timedRendezvousTransfer(f, other, {duration: 'auto'});
          assert.equal(plan.automatic, true);
          assert.ok(plan.duration > 3000 && plan.duration < 4000);
          assert.ok(plan.deltaV + plan.arrivalSpeed < 800);
          assert.ok(plan.burn.duration < 20);
          const impulse = rendezvousTransfer(own, other, {duration: plan.duration}),
            preview = maneuverPreview(
              centerOfVessel(f),
              f.vel,
              {universalTime: impulse.epoch},
              impulse.components,
              f.universalTime
            );
          assert.ok(preview.orbit.stable);
          const arrival = keplerDrift(
              preview.orbit.r,
              preview.orbit.relativeVelocity,
              own.body.mu,
              impulse.duration
            ),
            destination = keplerDrift(
              other.r,
              other.relativeVelocity,
              own.body.mu,
              impulse.arrivalTime - other.universalTime
            );
          assert.ok(Math.abs(arrival.position.distanceTo(destination.position) - 100) < 0.05);
          setTarget(f, f, target);
          const targetFuel = [...target.fuel];
          const schedule = (epoch, components, burn) => {
            f.maneuver = createManeuverNode(
              maneuverPreview(centerOfVessel(f), f.vel, {universalTime: epoch}, components, f.universalTime),
              f.time,
              automatic
                ? {
                    rendezvous: {
                      burnThrottle: burn.burnThrottle,
                      duration: burn.duration,
                      targetPartId: f.targetPartId
                    }
                  }
                : {}
            );
            f.maneuver.stopAtTarget = true;
            f.maneuver.tolerance = 0.05;
            f.sasMode = 'maneuver';
          };
          const advanceTo = epoch => {
            if (automatic) return;
            while (f.universalTime < epoch - 1e-6) runtime.step(Math.min(1 / 120, epoch - f.universalTime));
          };
          const burn = () => {
            if (automatic) {
              const session = new ManeuverSession();
              session.start(f);
              assert.equal(session.plan.startTime, f.maneuver.universalTime);
              for (let i = 0; i < 300 * 120 && session.owner; i++) {
                session.step(f, 1 / 120);
                runtime.replace(f);
                runtime.step(1 / 120);
              }
              assert.equal(session.state, 'complete', session.message);
            }
            for (let i = 0; i < 120 * 180 && !f.maneuver.complete && !f.crashed; i++) {
              f.throttle = transferThrottle(Math.hypot(...f.maneuver.remaining));
              runtime.step(1 / 120);
            }
            assert.equal(f.maneuver.complete, true);
            assert.equal(f.throttle, 0);
            assert.equal(f.crashed, false);
          };
          schedule(plan.epoch, plan.components, plan.burn);
          advanceTo(plan.epoch);
          burn();
          const stop = timedRelativeStopPlan(
            f,
            bodyOrbitState(centerOfVessel(target), target.vel, target.universalTime)
          );
          schedule(stop.location.universalTime, stop.components, stop.burn);
          const coast = runtime.coast(stop.time, {maxSteps: 10000});
          assert.equal(coast.reason, '予定噴射の直前', JSON.stringify(coast.blocker));
          assert.ok(Math.abs(stop.location.universalTime - f.universalTime - 60) < 0.05);
          advanceTo(stop.location.universalTime);
          burn();
          const close = relativeState(f, target);
          assert.ok(close.distance < 500, `separation ${close.distance}`);
          assert.ok(close.speed < 0.2, `relative speed ${close.speed}`);
          assert.ok(f.fuelRatio > 0.2);
          assert.deepEqual([...target.fuel], targetFuel);
          assert.equal(target.universalTime, f.universalTime);
          assert.equal(
            f.parts.filter(p => p.type === 'rcs').reduce((s, p) => s + f.fuel.get(p.id), 0),
            48
          );
          const restored = loadFlight(
            flightFromWorld(worldFromFlight(saveFlight(f), {history: world.history}))
          );
          try {
            assert.equal(restored.navigationTarget.vesselId, target.vesselId);
            assert.ok(
              Math.abs(relativeState(restored, restored.navigationTarget).distance - close.distance) < 1e-6
            );
            assert.deepEqual([...restored.fuel], [...f.fuel]);
          } finally {
            restored.dispose();
          }
          const ownPort = f.parts.find(p => p.type === 'dockingPort').id,
            targetPort = target.parts.find(p => p.type === 'dockingPort').id;
          assert.ok(selectDockingPorts(f, ownPort, targetPort));
          f.rcsEnabled = true;
          f.sasMode = 'dock';
          f.portTranslationEnabled = true;
          const clamp = x => Math.max(-1, Math.min(1, x));
          let dockingTime = 0;
          // Test driver sends the same bounded port-relative inputs as manual keys.
          // Limit desired velocity on EVERY axis; large lateral offsets must not
          // command tens of m/s merely because a near-port controller was reused.
          for (; dockingTime < 900; dockingTime += 1 / 120) {
            if (dockingStatus(f, ownPort, target, targetPort).ready) break;
            const nav = portGuidance(f, ownPort, target, targetPort),
              forward = clamp((nav.axial - (nav.lateral > 1 ? 20 : 0)) * 0.12) * 0.6;
            runtime.step(1 / 120, {
              portForward: clamp((forward - nav.closing) * 2),
              portRight: clamp((clamp(-nav.horizontal * 0.15) * 0.6 - nav.horizontalSpeed) * 2),
              portUp: clamp((clamp(-nav.vertical * 0.15) * 0.6 - nav.verticalSpeed) * 2)
            });
          }
          assert.ok(dockingTime < 700);
          assert.ok(dockingStatus(f, ownPort, target, targetPort).ready);
          assert.ok(dockingStatus(f, ownPort, target, targetPort).speed < 0.03);
          const monoprop = f.parts.filter(p => p.type === 'rcs').reduce((s, p) => s + f.fuel.get(p.id), 0);
          assert.ok(monoprop > 24 && monoprop < 48);
          const fuelBefore = [...f.fuel.values(), ...target.fuel.values()].reduce((a, b) => a + b, 0);
          f = dockVessels(f, target, ownPort, targetPort);
          assert.equal(f.parts.length, 22);
          assert.ok(Math.abs([...f.fuel.values()].reduce((a, b) => a + b, 0) - fuelBefore) < 1e-6);
          const docked = loadFlight(
            flightFromWorld(worldFromFlight(saveFlight(f), {history: world.history}))
          );
          try {
            assert.equal(docked.parts.length, 22);
            assert.equal(docked.parts.find(p => p.id === ownPort).dockPartner, targetPort);
            assert.equal(docked.parts.find(p => p.id === targetPort).dockPartner, ownPort);
            assert.deepEqual([...docked.fuel], [...f.fuel]);
          } finally {
            docked.dispose();
          }
          const stores = type =>
            f.parts.filter(p => p.type === type).sort((a, b) => f.fuel.get(b.id) - f.fuel.get(a.id));
          const tanks = stores('tank'),
            rcs = stores('rcs'),
            source = tanks[0].id,
            destinationTank = tanks.at(-1).id;
          const sourceBefore = f.fuel.get(source),
            destinationTankBefore = f.fuel.get(destinationTank);
          assert.ok(setPartAction(f, ownPort, 'fuelCrossfeed', false));
          assert.equal(f.transferFuel(source, destinationTank, 400), 0);
          assert.ok(setPartAction(f, ownPort, 'fuelCrossfeed', true));
          assert.equal(f.transferFuel(source, destinationTank, 400), 400);
          assert.equal(f.transferFuel(rcs[0].id, rcs.at(-1).id, 2), 2);
          assert.equal(f.fuel.get(source), sourceBefore - 400);
          assert.equal(f.fuel.get(destinationTank), destinationTankBefore + 400);
          const movedFuel = new Map(f.fuel);
          f = undockVessel(f, ownPort);
          assert.equal(f.parts.length, 11);
          assert.equal(f.transferFuel(source, destinationTank, 1), 0);
          const separatedWorld = worldFromFlight(saveFlight(f), {history: world.history});
          const incoming = separatedWorld.vessels.find(v => v.parts.some(p => p.id === targetPort));
          for (const v of separatedWorld.vessels)
            for (const p of v.parts)
              if (movedFuel.has(p.id)) assert.equal(new Map(v.fuel).get(p.id), movedFuel.get(p.id));
          const selected = selectWorldVessel(separatedWorld, incoming.vesselId);
          f.dispose();
          f = loadFlight(flightFromWorld(selected.world));
          const resumed = new WorldRuntime(f),
            others = [...resumed.vessels.values()].filter(v => v !== f),
            mainFuel = v => v.parts.filter(p => p.type === 'tank').map(p => [p.id, v.fuel.get(p.id)]),
            otherFuel = others.map(mainFuel);
          const initialFuel = mainFuel(f).reduce((a, b) => a + b[1], 0);
          f.throttle = 0.1;
          for (let i = 0; i < 240; i++) resumed.step(1 / 120);
          f.throttle = 0;
          assert.ok(mainFuel(f).reduce((a, b) => a + b[1], 0) < initialFuel);
          assert.equal(f.crashed, false);
          others.forEach((v, i) => {
            assert.deepEqual(mainFuel(v), otherFuel[i]);
            assert.equal(v.universalTime, f.universalTime);
          });
        }
        world = worldFromFlight(saveFlight(f), {history: world.history});
      } finally {
        f.dispose();
      }
    }
    assert.equal(world.history.filter(e => e.type === 'launch').length, 2);
  });

import assert from 'node:assert/strict';
import test from 'node:test';
import golden from './golden/aero-integration.json' with {type: 'json'};
import {Vector3} from 'three';
import {Flight} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {bodyUp} from '../dist/celestial.js';
import {surfaceVelocity, surfaceAngularVelocity} from '../dist/surface-frame.js';
import {deorbitPlan} from '../dist/deorbit-plan.js';
import {finiteBurnPreview} from '../dist/finite-burn.js';

function flightLoads(kind, localFlow, fuel) {
  const parts = preset(kind);
  for (const p of parts) if (PARTS[p.type].fuel) p.fuelLoad = fuel;
  const flight = new Flight(parts, 'runway', 161700);
  try {
    flight.pos.addScaledVector(bodyUp(flight.pos, flight.universalTime), 800);
    const com = flight.stats.com.clone().applyQuaternion(flight.q).add(flight.pos);
    flight.vel
      .copy(surfaceVelocity(com, flight.universalTime))
      .add(new Vector3(...localFlow).applyQuaternion(flight.q));
    flight.omega.copy(surfaceAngularVelocity()).add(new Vector3(0.04, -0.06, 0.1).applyQuaternion(flight.q));
    flight.sas = false;
    // Observe forces at the physics boundary; only drag acts at the COM of these unpowered airborne craft.
    const loads = [],
      original = flight.body.addForceAtPoint.bind(flight.body),
      inverse = flight.q.clone().invert();
    flight.body.addForceAtPoint = (force, point, wake) => {
      if (force.lengthSq() > 0)
        loads.push({force: force.clone().applyQuaternion(inverse), point: point.clone()});
      return original(force, point, wake);
    };
    flight.step(1 / 120, {pitch: 0.45, roll: -0.55, yaw: 0.3});
    assert.equal(flight.telemetry.contacts, 0);
    assert.equal(flight.telemetry.engineForce.length(), 0);
    const center = com.clone().sub(flight.physicsOrigin);
    const centerLoads = loads.filter(load => load.point.distanceTo(center) < 1e-7);
    assert.equal(centerLoads.length, 1);
    const body = centerLoads[0];
    const surfaces = loads.filter(load => load !== body);
    assert.equal(surfaces.length, parts.filter(p => PARTS[p.type].wing).length);
    const force = new Vector3(),
      moment = new Vector3();
    for (const wing of surfaces) {
      force.add(wing.force);
      moment.add(wing.point.clone().sub(body.point).applyQuaternion(inverse).cross(wing.force));
    }
    return {
      body: body.force.toArray(),
      wings: force.toArray(),
      moment: moment.toArray(),
      appliedMoment: flight.telemetry.torque.clone().applyQuaternion(inverse).toArray(),
      stalled: flight.telemetry.stallCount
    };
  } finally {
    flight.dispose();
  }
}

function returnForecast() {
  const f = new Flight(preset('returner'), 'orbit');
  try {
    f.stageNext();
    f.stageNext();
    const com = f.stats.com.clone().applyQuaternion(f.q).add(f.pos);
    const plan = deorbitPlan(com, f.vel, 0, {delay: 360});
    const result = finiteBurnPreview(f, plan.preview.impulse, 360, {throttle: 0.01, step: 0.1});
    assert.equal(result.atmospheric, true);
    return {periapsis: result.orbit.periapsis, cutoff: result.endTime};
  } finally {
    f.dispose();
  }
}
const scenarios = {
  small: () => flightLoads('plane', [3, -5, 80], 1),
  stalled: () => flightLoads('plane', [-9, -40, 75], 0.5),
  transport: () => flightLoads('transport-cargo', [2, -6, 75], 0.5)
};
for (const [name, run] of Object.entries(scenarios)) {
  test('airframe loads and wing moments: ' + name, () => {
    const actual = run(),
      expected = golden[name];
    assert.equal(actual.stalled, expected.stalled);
    for (const field of ['body', 'wings', 'moment']) {
      for (const [axis, value] of actual[field].entries()) {
        const ref = expected[field][axis];
        assert.ok(
          Math.abs(value - ref) <= 0.1 + Math.abs(ref) * 1e-4,
          name + ' ' + field + ' axis ' + axis + ': ' + value + ' vs ' + ref
        );
      }
    }
    assert.ok(new Vector3(...actual.moment).distanceTo(new Vector3(...actual.appliedMoment)) < 1e-5);
  });
}
test('atmospheric finite-burn prediction retains its cutoff and periapsis', () => {
  const actual = returnForecast();
  assert.ok(Math.abs(actual.periapsis - golden.forecast.periapsis) < 1);
  assert.ok(Math.abs(actual.cutoff - golden.forecast.cutoff) < 0.01);
});

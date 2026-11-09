import assert from 'node:assert/strict';

import {Euler, Quaternion, Vector3} from 'three';
import {Flight} from '../../dist/core.js';
import {part, preset, PARTS} from '../../dist/catalog.js';
import {partCenter, partRotation} from '../../dist/aero.js';
import {bodyAltitude, bodyGravity, bodyUp} from '../../dist/celestial.js';
import {displacedVolume} from '../../dist/buoyancy.js';
import {surfaceAngularVelocity, surfaceVelocity} from '../../dist/surface-frame.js';

export const cases = {
  surfacedSub: {kind: 'sub', height: 0, ballast: 0.3},
  submergedSub: {kind: 'sub', height: -4, ballast: 1},
  floatEntry: {kind: 'plane', height: 0.4, ballast: 0},
  floatDry: {kind: 'plane', height: 3, ballast: 0}
};

function measure({kind, height, ballast}, moving, applyLoads) {
  const parts = preset(kind).filter(p => !PARTS[p.type].retractable);
  if (kind === 'plane') {
    for (const x of [-1.4, 1.4]) {
      const float = part('pontoon', [x, -0.3, 0], [Math.PI / 2, 0, 0]);
      float.parent = parts[1].id;
      parts.push(float);
    }
  }
  const f = new Flight(parts, 'water', 161700);
  try {
    f.sas = false;
    f.ballast = ballast;
    f.pos.addScaledVector(bodyUp(f.pos, f.universalTime), height - bodyAltitude(f.pos, f.universalTime));
    f.q.multiply(new Quaternion().setFromEuler(new Euler(0.08, -0.04, 0.15)));
    const inverse = f.q.clone().invert();
    const com = f.vesselStats().com;
    const worldCOM = com.clone().applyQuaternion(f.q).add(f.pos);
    f.vel.copy(surfaceVelocity(worldCOM, f.universalTime));
    f.omega.copy(surfaceAngularVelocity());
    if (moving) {
      f.vel.add(new Vector3(1, -2.5, 8).applyQuaternion(f.q));
      f.omega.add(new Vector3(0.1, -0.07, 0.15).applyQuaternion(f.q));
    }
    const samples = parts.flatMap(p =>
      [-0.32, 0.32].map(side => {
        const point = new Vector3(0, side * PARTS[p.type].size[1], 0)
          .applyQuaternion(partRotation(p))
          .add(partCenter(p));
        const world = point.clone().applyQuaternion(f.q).add(f.pos);
        return {
          point,
          world,
          part: p,
          type: p.type,
          force: new Vector3(),
          fullBuoyancy: 500 * displacedVolume(p) * bodyGravity(world, f.universalTime).length()
        };
      })
    );
    applyLoads(f, samples, inverse, worldCOM);
    const total = new Vector3(),
      moment = new Vector3();
    for (const s of samples) {
      total.add(s.force);
      moment.add(s.point.clone().sub(com).cross(s.force));
    }
    return {
      total,
      moment,
      wet: samples.filter(s => s.force.length() > 1e-5).length,
      fractions: samples
        .filter(s => s.type === (kind === 'sub' ? 'ballast' : 'pontoon'))
        .map(s => s.force.length() / s.fullBuoyancy)
    };
  } finally {
    f.dispose();
  }
}

export function reading(scenario, applyLoads = observeFlight) {
  // The two steps start at identical poses and waterlines. Subtract the stationary load to isolate
  // velocity-dependent water resistance and planing pressure at the same COM.
  const still = measure(scenario, false, applyLoads),
    moving = measure(scenario, true, applyLoads);
  return {
    wet: still.wet,
    fractions: still.fractions,
    buoyancy: still.total.toArray(),
    buoyancyMoment: still.moment.toArray(),
    dynamic: moving.total.sub(still.total).toArray(),
    dynamicMoment: moving.moment.sub(still.moment).toArray()
  };
}

export function observeFlight(f, samples, inverse) {
  // Match by position rather than call order. A future kernel can combine all water forces at one sample.
  const original = f.body.addForceAtPoint.bind(f.body);
  f.body.addForceAtPoint = (force, point, wake) => {
    const world = point.clone().add(f.physicsOrigin);
    const sample = samples.find(s => s.world.distanceToSquared(world) < 1e-14);
    if (sample) sample.force.add(force.clone().applyQuaternion(inverse));
    return original(force, point, wake);
  };
  f.step(1 / 120);
  assert.equal(f.telemetry.contacts, 0);
  assert.equal(f.telemetry.engineForce.length(), 0);
}

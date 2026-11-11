// End-to-end diagnostic: a normal runway departure, then the shipped ReturnPilot flies the
// return and hands off to the landing guidance. No airborne reset.
import * as T from 'three';
import {Flight} from '../dist/core.js';
import {preset, PARTS} from '../dist/catalog.js';
import {bodyAltitude} from '../dist/celestial.js';
import {inertialToFixed, launchSiteOrientation} from '../dist/surface-frame.js';
import {compassHeading} from '../dist/navigation.js';
import {runwayApproach} from '../dist/runway-navigation.js';
import {extendWheelTrack} from '../dist/runway-wheel-track.js';
import {TakeoffPrototype} from '../dist/takeoff-prototype.js';
import {LandingPrototype} from '../dist/landing-prototype.js';
import {ReturnPilot} from '../dist/runway-return-pilot.js';
export function runReturnFlight({
  kind = 'plane-large',
  fuelLoad = 0.5,
  seconds = 1400,
  log = () => {},
  returnAfter = 0,
  outboundHeading = null
} = {}) {
  const parts = preset(kind);
  for (const p of parts) if (PARTS[p.type].fuel) p.fuelLoad = fuelLoad;
  const f = new Flight(parts, 'runway', 161700),
    owner = f.vesselId;
  const takeoff = new TakeoffPrototype(f, {
    speed: 90,
    altitude: 600,
    rotation: 12,
    integral: true,
    handoff: 'attitude'
  });
  const inverse = launchSiteOrientation('runway').invert();
  let landing = null,
    departureTrack = null,
    everAirborne = false,
    handoff = null,
    previousPhase = null,
    unexpectedContact = null,
    landingTouch = null;
  const initialFuel = [...f.fuel.values()].reduce((a, b) => a + b, 0),
    initialParts = f.parts.length;
  const events = [];
  f.stageNext();
  let route = null,
    progress = 0,
    maxRouteError = 0,
    returning = null;
  try {
    for (let i = 0; i < seconds * 120 && !f.crashed; i++) {
      const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
        height = bodyAltitude(center, f.universalTime);
      const local = inertialToFixed(center, f.universalTime).applyQuaternion(inverse);
      const heading = compassHeading(new T.Vector3(0, 0, 1).applyQuaternion(f.q), center, f.universalTime);
      const runway = runwayApproach(center, f.universalTime, '09', f.vel);
      if (!landing && takeoff.cruise) {
        if (!returning && outboundHeading !== null) takeoff.cruise.target.heading = outboundHeading;
        if (
          !returning &&
          f.time >= returnAfter &&
          height > 580 &&
          Math.abs(takeoff.cruise.telemetry.vertical ?? 99) < 1
        )
          returning = new ReturnPilot(f);
        if (returning) {
          route = returning.route;
          progress = returning.progress;
          maxRouteError = returning.maxRouteError;
          if (!returning.running) break;
          if (returning.phase === 'capture') {
            handoff = {
              time: f.time,
              height,
              heading,
              remaining: runway.remaining,
              cross: runway.crossTrack,
              speed: f.telemetry.surfaceSpeed
            };
            returning.stop('handoff');
            landing = new LandingPrototype(f);
          }
        }
      }
      const phase = landing
        ? `landing:${landing.phase}`
        : returning
          ? 'return'
          : `departure:${takeoff.phase}`;
      if (phase !== previousPhase) {
        const event = {time: f.time, phase, height, heading, x: local.x, z: local.z};
        events.push(event);
        log(event);
        previousPhase = phase;
      }
      if (i % (30 * 120) === 0)
        log({time: f.time, phase, height, heading, x: local.x, z: local.z, speed: f.telemetry.surfaceSpeed});
      if (landing && ['stopped', 'failed', 'go-around'].includes(landing.phase)) break;
      const commands = landing
        ? landing.update(f, 1 / 120)
        : returning
          ? returning.update(f, 1 / 120)
          : takeoff.update(f, 1 / 120);
      f.step(1 / 120, commands);
      if (everAirborne && f.telemetry.contacts) {
        const contact = {time: f.time, impact: f.telemetry.wheelImpactSpeed};
        if (landing) landingTouch ??= contact;
        else unexpectedContact ??= contact;
      }
      if (!everAirborne && f.telemetry.contacts)
        departureTrack = extendWheelTrack(departureTrack, f.telemetry.wheelContacts);
      if (height > 30 && !f.telemetry.contacts) everAirborne = true;
    }
    return {
      kind,
      fuelLoad,
      time: f.time,
      initialFuel,
      remainingFuel: [...f.fuel.values()].reduce((a, b) => a + b, 0),
      initialParts,
      remainingParts: f.parts.length,
      ownerUnchanged: f.vesselId === owner,
      crashed: f.crashed,
      landed: f.landed,
      everAirborne,
      unexpectedContact,
      departureTrack,
      handoff,
      route: route
        ? {family: route.family, length: route.length, radius: route.radius, progress, maxRouteError}
        : null,
      result: landing?.phase ?? 'incomplete',
      abort: landing?.abort,
      landingTouch,
      landingTrack: landing?.track,
      final: landing?.telemetry,
      events
    };
  } finally {
    f.dispose();
  }
}
if (process.argv[1]?.endsWith('return-flight-profile.mjs'))
  console.log(
    JSON.stringify(
      runReturnFlight({
        kind: process.argv[2] ?? 'plane-large',
        log: r => console.log(JSON.stringify(r))
      })
    )
  );

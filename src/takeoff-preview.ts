// Takeoff forecast: flies the departure in an isolated physics world loaded from a snapshot of
// the flight, so the live vessel is never stepped. The forecast worker runs runTakeoffPreview.
import {saveFlight, loadFlight, type SavedFlight} from './flight-save.js';
import {TakeoffPrototype, type TakeoffTarget} from './takeoff-prototype.js';
import {runwayApproach} from './runway-navigation.js';
import {extendWheelTrack, type WheelTrack} from './runway-wheel-track.js';
import type {Flight} from './core.js';
export interface TakeoffPreviewOptions {
  seconds?: number;
  hz?: number;
}
/** The pilot state a forecast continues from. */
export interface TakeoffPilotSnapshot {
  target: TakeoffTarget;
  rotation: number;
  integral: boolean;
  handoffMode: string;
  phase: string;
  pitchBias: number;
}
export interface TakeoffRequest {
  flight: SavedFlight;
  pilot: TakeoffPilotSnapshot;
  seconds: number;
  hz: number;
}
export interface TakeoffGroundPoint {
  along: number;
  cross: number;
  time: number;
}
export interface TakeoffPreview {
  status: 'airborne' | 'crashed' | 'unresolved';
  lastGround: TakeoffGroundPoint | null;
  wheelTrack: WheelTrack | null;
  elapsedMs: number;
}
type PreviewPilot = TakeoffPilotSnapshot & Pick<TakeoffPrototype, 'owner'>;
export function previewTakeoff(
  f: Flight,
  p: PreviewPilot,
  {seconds = 20, hz = 120}: TakeoffPreviewOptions = {}
): TakeoffPreview {
  return runTakeoffPreview(createTakeoffRequest(f, p, {seconds, hz}));
}
export function createTakeoffRequest(
  f: Flight,
  p: PreviewPilot,
  {seconds = 20, hz = 120}: TakeoffPreviewOptions = {}
): TakeoffRequest {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60 || ![60, 120].includes(hz))
    throw Error('Invalid forecast horizon');
  if (p.owner !== f.vesselId || !['roll', 'rotate'].includes(p.phase))
    throw Error('Forecast requires the owned departure');
  return {
    flight: saveFlight(f),
    pilot: {
      target: {...p.target},
      rotation: p.rotation,
      integral: p.integral,
      handoffMode: p.handoffMode,
      phase: p.phase,
      pitchBias: p.pitchBias
    },
    seconds,
    hz
  };
}
export function runTakeoffPreview({flight, pilot: p, seconds, hz}: TakeoffRequest): TakeoffPreview {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60 || ![60, 120].includes(hz))
    throw Error('Invalid forecast horizon');
  const clone = loadFlight(flight);
  const pilot = new TakeoffPrototype(clone, {
    ...p.target,
    rotation: p.rotation,
    integral: p.integral,
    handoff: p.handoffMode
  });
  pilot.phase = p.phase;
  pilot.pitchBias = p.pitchBias;
  pilot.target = {...p.target};
  let lastGround: TakeoffGroundPoint | null = null,
    airborne = 0,
    wheelTrack: WheelTrack | null = null;
  const begin = performance.now();
  try {
    for (let i = 0; i < seconds * hz && !clone.crashed; i++) {
      clone.step(1 / hz, pilot.update(clone, 1 / hz));
      wheelTrack = extendWheelTrack(wheelTrack, clone.telemetry.wheelContacts || []);
      const center = clone.pos.clone().add(clone.stats.com.clone().applyQuaternion(clone.q)),
        r = runwayApproach(center, clone.universalTime, '09', clone.vel);
      if (clone.telemetry.contacts) {
        if (!r) throw TypeError('No runway approach away from the home planet');
        lastGround = {along: -r.remaining, cross: r.crossTrack, time: clone.time};
      }
      airborne = !clone.telemetry.contacts && clone.orbit.altitude > 10 ? airborne + 1 / hz : 0;
      if (airborne >= 1)
        return {status: 'airborne', lastGround, wheelTrack, elapsedMs: performance.now() - begin};
    }
    return {
      status: clone.crashed ? 'crashed' : 'unresolved',
      lastGround,
      wheelTrack,
      elapsedMs: performance.now() - begin
    };
  } finally {
    clone.dispose();
  }
}

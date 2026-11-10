// Automatic takeoff lifecycle: admission (departureReadiness), a forecast of the ground roll in the
// forecast worker, and a start that is accepted only while the forecast still describes the vessel.
import {cruiseAuthority, cruisePropulsion, cruiseSettings, cruiseTargetReadiness} from './cruise-pilot.js';
import {surfaceRelativeVelocity, inertialToFixed, surfaceOrientation} from './surface-frame.js';
import {compassHeading} from './navigation.js';
import * as T from 'three';
import {runwayApproach, RUNWAY} from './runway-navigation.js';
import {bodyAltitude} from './celestial.js';
import {TakeoffPrototype} from './takeoff-prototype.js';
import type {TakeoffPreviewClient, TakeoffForecast} from './takeoff-preview-client.js';
import type {CruiseSettings, CruiseSettingsInput} from './cruise-pilot.js';
import type {Flight} from './core.js';
export type {AutopilotCommands} from './takeoff-prototype.js';
/** The pilot a started takeoff hands to the flight loop. */
export type TakeoffPilot = TakeoffPrototype;
export interface TakeoffPrepareResult extends TakeoffForecast {
  accepted?: boolean;
}
interface VesselPose {
  position: T.Vector3;
  rotation: T.Quaternion;
}
interface PreparedTakeoff {
  f: Flight;
  stamp: string;
  target: CruiseSettings;
  result: TakeoffForecast;
  initialPose: VesselPose;
  epoch: number;
}
// Runway-end reserve is experimental; obstacle clearance is a separate gate.
export const TAKEOFF_END_MARGIN = 75;
export function departureReadiness(f: Flight, target: CruiseSettings): string | null {
  const problem = cruiseAuthority(f) || cruisePropulsion(f);
  if (problem) return problem;
  if (f.environment !== 'runway' || !f.telemetry.contacts || bodyAltitude(f.pos, f.universalTime) > 20)
    return '滑走路上で準備してください';
  if (
    surfaceRelativeVelocity(
      f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
      f.vel,
      f.universalTime
    ).length() > 0.5 ||
    f.throttle !== 0 ||
    !f.brake
  )
    return '停止・推力ゼロ・ブレーキを確認してください';
  const r = runwayApproach(f.pos, f.universalTime, '09', f.vel);
  if (!r || -r.remaining < 0 || -r.remaining > RUNWAY.length || Math.abs(r.crossTrack) > RUNWAY.width / 2)
    return '滑走路の内側で準備してください';
  const heading = compassHeading(new T.Vector3(0, 0, 1).applyQuaternion(f.q), f.pos, f.universalTime);
  if (heading === null || Math.abs(((heading - 90 + 540) % 360) - 180) > 2)
    return '滑走路09へ機首を合わせてください';
  if (target.mode !== 'altitude') return '離陸目標には高度保持を選んでください';
  return cruiseTargetReadiness(f, target);
}
const fingerprint = (f: Flight): string =>
  JSON.stringify({
    parts: f.parts,
    fuel: [...f.fuel],
    active: [...f.active],
    ballast: f.ballast,
    reaction: f.reactionEnabled,
    steering: f.steeringEnabled,
    drive: f.driveEnabled,
    trim: f.trim,
    sas: f.sas,
    sasMode: f.sasMode
  });
const pose = (f: Flight): VesselPose => ({
  position: inertialToFixed(f.pos, f.universalTime),
  rotation: surfaceOrientation(f.universalTime).invert().multiply(f.q)
});
const matchesPose = (f: Flight, before: VesselPose): boolean => {
  const now = pose(f);
  return (
    now.position.distanceTo(before.position) < 0.5 && now.rotation.angleTo(before.rotation) < Math.PI / 360
  );
};
export class TakeoffSession {
  declare client: TakeoffPreviewClient;
  declare generation: number;
  declare state: string;
  declare prepared: PreparedTakeoff | null;
  constructor(client: TakeoffPreviewClient) {
    this.client = client;
    this.generation = 0;
    this.state = 'idle';
    this.prepared = null;
  }
  cancel(): void {
    this.generation++;
    this.client.cancel();
    this.prepared = null;
    this.state = 'idle';
  }
  async prepare(f: Flight, settings: Partial<CruiseSettingsInput>): Promise<TakeoffPrepareResult> {
    this.cancel();
    const generation = this.generation,
      target = cruiseSettings(settings),
      problem = departureReadiness(f, target);
    if (problem) throw Error(problem);
    const pilot = new TakeoffPrototype(f, {...target, rotation: 12, integral: true, handoff: 'attitude'});
    pilot.target = {...target};
    const stamp = fingerprint(f),
      initialPose = pose(f);
    this.state = 'predicting';
    try {
      const result = await this.client.request(f, pilot, {seconds: 40});
      if (generation !== this.generation) return {status: 'cancelled'};
      if (!result) throw TypeError('The forecast request ended without a result');
      if (
        ['cancelled', 'stale'].includes(result.status) ||
        stamp !== fingerprint(f) ||
        !matchesPose(f, initialPose) ||
        departureReadiness(f, target)
      ) {
        this.state = 'idle';
        return {status: 'stale'};
      }
      const track = result.wheelTrack;
      if (
        result.status !== 'airborne' ||
        !track ||
        !(['minAlong', 'maxAlong', 'maxCross', 'samples'] as const).every(k => Number.isFinite(track[k])) ||
        track.samples <= 0 ||
        track.minAlong < 0 ||
        track.maxAlong > RUNWAY.length - TAKEOFF_END_MARGIN ||
        track.maxCross > RUNWAY.width / 2
      ) {
        this.state = 'rejected';
        return {...result, accepted: false};
      }
      this.prepared = {f, stamp, target, result, initialPose, epoch: f.universalTime};
      this.state = 'ready';
      return {...result, accepted: true};
    } catch (error) {
      if (generation !== this.generation) return {status: 'cancelled'};
      this.state = 'idle';
      this.prepared = null;
      throw error;
    }
  }
  readyFor(f: Flight, settings: Partial<CruiseSettingsInput>): boolean {
    const ready = this.prepared;
    if (this.state !== 'ready' || !ready) return false;
    const valid =
      ready.f === f &&
      fingerprint(f) === ready.stamp &&
      matchesPose(f, ready.initialPose) &&
      JSON.stringify(cruiseSettings(settings)) === JSON.stringify(ready.target) &&
      f.universalTime >= ready.epoch &&
      f.universalTime - ready.epoch <= 5 &&
      !departureReadiness(f, ready.target);
    if (!valid) this.cancel();
    return valid;
  }
  start(f: Flight, settings: Partial<CruiseSettingsInput>): TakeoffPilot {
    const target = cruiseSettings(settings);
    if (!this.readyFor(f, target)) {
      this.cancel();
      throw Error('状態が変わりました。離陸を再予測してください');
    }
    this.prepared = null;
    this.state = 'running';
    const pilot = new TakeoffPrototype(f, {...target, rotation: 12, integral: true, handoff: 'attitude'});
    pilot.target = {...target};
    return pilot;
  }
}

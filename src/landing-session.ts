// Automatic landing lifecycle: admission to the capture envelope (landingReadiness), a trim plan
// from the landing plan worker, the approach itself, and the climb-out after a go-around.
import * as T from 'three';
import {
  CruisePilot,
  cruiseSettings,
  cruiseReadiness,
  cruiseTargetReadiness,
  cruiseAuthority,
  cruisePropulsion,
  type CruisePrevious,
  type CruiseTelemetry
} from './cruise-pilot.js';
import {bodyAltitude, bodyUp, referenceBody} from './celestial.js';
import {surfaceRelativeVelocity} from './surface-frame.js';
import {compassHeading} from './navigation.js';
import {runwayApproach} from './runway-navigation.js';
import {PARTS} from './catalog.js';
import {
  landingPlanCurrent,
  landingPlanMatches,
  type LandingPlanClient,
  type LandingPlanContext,
  type LandingPlanResult
} from './landing-plan-client.js';
import {LandingPrototype, type LandingTelemetry} from './landing-prototype.js';
import type {AutopilotCommands} from './takeoff-prototype.js';
import type {LandingPlan} from './landing-trim.js';
import type {Flight} from './core.js';
/** The pilot of a running landing, as the flight loop and panel see it. */
export type LandingPilot = LandingPrototype;
export type LandingPrepareResult = LandingPlanResult;
interface PreparedLanding {
  f: Flight;
  plan: LandingPlan;
  context: LandingPlanContext;
  end: string;
}

// Initial capture envelope, based on the approach and normal-return trials.
// This is not a route planner from arbitrary positions or a landing guarantee.
export function landingReadiness(f: Flight, end = '09'): string | null {
  if (!['09', '27'].includes(end)) return '着陸方向を選択してください';
  const problem = cruiseAuthority(f) || cruisePropulsion(f);
  if (problem) return problem;
  if (!f.parts.some(p => PARTS[p.type].wheel)) return '着陸用の車輪が必要';
  const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
  if (referenceBody(center, f.universalTime).id !== 'planet' || f.telemetry.contacts)
    return `母星の滑走路${end}へ飛行中に準備してください`;
  const h = bodyAltitude(center, f.universalTime),
    up = bodyUp(center, f.universalTime),
    v = surfaceRelativeVelocity(center, f.vel, f.universalTime);
  const r = runwayApproach(center, f.universalTime, end, f.vel),
    heading = compassHeading(new T.Vector3(0, 0, 1).applyQuaternion(f.q), center, f.universalTime);
  if (
    !r ||
    heading === null ||
    ![h, heading, r.remaining, r.crossTrack, v.length(), v.dot(up)].every(Number.isFinite) ||
    h < 300 ||
    h > 400 ||
    r.remaining < 5000 ||
    r.remaining > 10000 ||
    Math.abs(r.crossTrack) > 250 ||
    Math.abs(((heading - (end === '27' ? 270 : 90) + 540) % 360) - 180) > 15
  )
    return `${end}端の手前5〜10 km・高度300〜400 mで進入方向へ整列してください`;
  if (
    v.length() < 40 ||
    v.length() > 170 ||
    Math.abs(v.dot(up)) > 6 ||
    new T.Vector3(0, 1, 0).applyQuaternion(f.q).dot(up) < 0.94
  )
    return '速度・姿勢・昇降率を安定させてください';
  return null;
}

export class LandingSession {
  declare client: LandingPlanClient;
  declare generation: number;
  declare state: string;
  declare prepared: PreparedLanding | null;
  declare pilot: LandingPilot | null;
  declare owner: Flight | null;
  declare previous: CruisePrevious | undefined;
  declare recovery: CruisePilot | null | undefined;
  declare reason: string | null | undefined;
  declare faultMessage: string | null | undefined;
  declare telemetry: LandingTelemetry | CruiseTelemetry | undefined;
  constructor(client: LandingPlanClient) {
    this.client = client;
    this.generation = 0;
    this.state = 'idle';
    this.prepared = null;
    this.pilot = null;
    this.owner = null;
  }
  cancel(): void {
    this.generation++;
    this.client.cancel();
    this.prepared = null;
    if (!this.pilot) this.state = 'idle';
  }
  async prepare(f: Flight, {end = '09'}: {end?: string} = {}): Promise<LandingPrepareResult> {
    if (this.pilot) throw Error('着陸制御を停止してから再準備してください');
    this.cancel();
    const generation = this.generation,
      problem = landingReadiness(f, end);
    if (problem) throw Error(problem);
    this.state = 'planning';
    try {
      const result = await this.client.request(f);
      if (generation !== this.generation) return {status: 'cancelled'};
      if (!result) throw TypeError('The landing plan request ended without a result');
      if (result.status !== 'ready') {
        this.state = result.status === 'unavailable' ? 'rejected' : 'idle';
        return result;
      }
      if (
        !result.context ||
        !landingPlanMatches(result.plan, result.context) ||
        !landingPlanCurrent(f, result.context) ||
        landingReadiness(f, end)
      ) {
        this.state = 'idle';
        return {status: 'stale'};
      }
      this.prepared = {f, ...result, plan: result.plan, context: result.context, end};
      this.state = 'ready';
      return result;
    } catch (error) {
      if (generation !== this.generation) return {status: 'cancelled'};
      this.state = 'idle';
      throw error;
    }
  }
  readyFor(f: Flight): boolean {
    if (this.state !== 'ready' || !this.prepared) return false;
    const p = this.prepared,
      valid = p.f === f && landingPlanCurrent(f, p.context) && !landingReadiness(f, p.end);
    if (!valid) this.cancel();
    return valid;
  }
  start(f: Flight): LandingPilot {
    if (!this.readyFor(f)) throw Error('進入状態が変わりました。着陸を再準備してください');
    const p = this.prepared;
    if (!p) throw TypeError('No prepared landing');
    const pilot = new LandingPrototype(f, {end: p.end, preparedPlan: p.plan, preparedContext: p.context});
    this.previous = {sas: f.sas, sasMode: f.sasMode, trim: f.trim};
    this.owner = f;
    this.pilot = pilot;
    this.recovery = null;
    this.prepared = null;
    this.state = 'running';
    this.reason = null;
    this.faultMessage = null;
    return pilot;
  }
  stop(reason = 'manual'): void {
    this.cancel();
    const f = this.owner;
    if (f && this.pilot) {
      Object.assign(f, this.previous);
      f.holdQ = f.q.clone();
      if (reason === 'fault' || reason === 'landed') f.throttle = 0;
      if (reason === 'landed') f.brake = true;
    }
    this.pilot = null;
    this.recovery = null;
    this.owner = null;
    this.state = reason === 'fault' ? 'failed' : reason === 'landed' ? 'landed' : 'idle';
    this.reason = reason;
  }
  goAround(f: Flight): boolean {
    if (f !== this.owner || !this.pilot || this.pilot.phase !== 'approach') return false;
    this.pilot.phase = 'go-around';
    this.pilot.reason = 'requested';
    return true;
  }
  step(f: Flight, dt: number, {manual = false}: {manual?: boolean} = {}): AutopilotCommands {
    if (!this.pilot) return {};
    if (f !== this.owner || manual) {
      this.stop(manual ? 'manual' : 'vessel changed');
      return {};
    }
    if (f.crashed || !Number.isFinite(dt) || dt < 0) {
      this.stop('fault');
      return {};
    }
    if (dt === 0) return {};
    const problem = cruiseAuthority(f) || (this.pilot.phase === 'rollout' ? null : cruisePropulsion(f));
    if (problem) {
      this.stop('fault');
      this.faultMessage = problem;
      return {};
    }
    if (this.pilot.phase === 'go-around' && !this.recovery) {
      const center = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q));
      if (bodyAltitude(center, f.universalTime) >= 450 && !cruiseReadiness(f)) {
        const target = {
          speed: Math.max(90, this.pilot.trimPlan?.speed ?? 90),
          altitude: 600,
          heading: compassHeading(new T.Vector3(0, 0, 1).applyQuaternion(f.q), center, f.universalTime),
          mode: 'altitude',
          vertical: 0
        };
        if (!cruiseTargetReadiness(f, target)) {
          // A target without a compass heading is refused by cruiseSettings, as CruisePilot would refuse it.
          this.recovery = new CruisePilot(
            f,
            cruiseSettings({...target, heading: target.heading ?? undefined})
          );
          this.pilot.phase = 'recovery';
        }
      }
    }
    if (this.recovery) {
      this.recovery.update(f, dt);
      this.telemetry = this.recovery.telemetry;
      if (!this.recovery.running) {
        this.faultMessage = this.recovery.faultMessage;
        this.stop('fault');
        return {};
      }
      this.pilot.phase = this.recovery.status === '保持' ? 'recovery-hold' : 'recovery';
      return {};
    }
    const commands = this.pilot.update(f, dt);
    this.telemetry = this.pilot.telemetry;
    if (this.pilot.phase === 'failed') {
      this.faultMessage = this.pilot.reason;
      this.stop('fault');
      return {};
    }
    if (this.pilot.phase === 'stopped') {
      this.stop('landed');
      return {};
    }
    return commands;
  }
}

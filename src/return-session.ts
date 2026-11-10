import {ReturnPilot, type ReturnSettings} from './runway-return-pilot.js';
import {LandingSession} from './landing-session.js';
import type {LandingPlanClient} from './landing-plan-client.js';
import type {AutopilotCommands} from './takeoff-prototype.js';
import type {Flight} from './core.js';

// Owns one complete return/landing attempt. Promise completion never starts
// actuators: handoff occurs only on the next unpaused simulation step.
export class ReturnSession {
  declare landing: LandingSession;
  declare generation: number;
  declare state: string;
  declare owner: Flight | null;
  declare pilot: ReturnPilot | null;
  declare pending: Promise<void> | null;
  declare message: string | null | undefined;
  declare telemetry: ReturnPilot['telemetry'] | LandingSession['telemetry'];
  constructor(client: LandingPlanClient) {
    this.landing = new LandingSession(client);
    this.generation = 0;
    this.state = 'idle';
    this.owner = null;
    this.pilot = null;
    this.pending = null;
  }
  start(f: Flight, settings?: ReturnSettings): ReturnPilot {
    if (this.owner) throw Error('現在の自動操縦を停止してください');
    const pilot = new ReturnPilot(f, settings);
    this.generation++;
    this.owner = f;
    this.pilot = pilot;
    this.state = 'return';
    this.message = null;
    return pilot;
  }
  stop(reason = 'manual'): void {
    this.generation++;
    this.landing.stop(reason);
    this.pilot?.stop(reason);
    this.pilot = null;
    this.owner = null;
    this.pending = null;
    this.state = reason === 'fault' ? 'failed' : 'idle';
  }
  recover(message: string | undefined): void {
    this.generation++;
    this.landing.cancel();
    this.pending = null;
    this.message = message;
    this.pilot?.recover(message);
    this.state = 'recovery';
  }
  prepare(f: Flight): void {
    const generation = this.generation,
      pilot = this.pilot;
    this.state = 'planning';
    if (!pilot) throw TypeError('No return in progress');
    this.pending = this.landing
      .prepare(f, {end: pilot.end})
      .then(result => {
        if (generation !== this.generation || f !== this.owner) return;
        this.pending = null;
        if (result.status !== 'ready') this.recover('着陸計画が成立しませんでした · 高度600 mへ');
      })
      .catch(error => {
        if (generation !== this.generation || f !== this.owner) return;
        this.recover(error.message + ' · 高度600 mへ');
      });
  }
  step(f: Flight, dt: number, {manual = false}: {manual?: boolean} = {}): AutopilotCommands {
    if (!this.owner) return {};
    if (f !== this.owner || manual) {
      this.stop(manual ? 'manual' : 'vessel changed');
      return {};
    }
    if (!Number.isFinite(dt) || dt < 0 || f.crashed) {
      this.stop('fault');
      return {};
    }
    if (dt === 0) return {};
    if (this.landing.pilot) {
      const commands = this.landing.step(f, dt);
      this.telemetry = this.landing.telemetry;
      this.state = this.landing.pilot?.phase ?? this.landing.state;
      if (!this.landing.pilot) {
        this.owner = null;
        this.pilot = null;
        this.generation++;
      }
      return commands;
    }
    const pilot = this.pilot;
    if (this.landing.state === 'ready') {
      if (!this.landing.readyFor(f)) {
        this.recover('着陸計画が失効しました · 高度600 mへ');
      } else {
        if (!pilot) throw TypeError('No return in progress');
        pilot.stop('handoff');
        try {
          this.landing.start(f);
          this.state = 'approach';
          return this.landing.step(f, dt);
        } catch (error) {
          this.message = error instanceof Error ? error.message : String(error);
          this.stop('fault');
          return {};
        }
      }
    }
    if (!pilot) throw TypeError('No return in progress');
    const commands = pilot.update(f, dt);
    this.telemetry = pilot.telemetry;
    if (!pilot.running) {
      this.message = pilot.faultMessage;
      this.stop('fault');
      return {};
    }
    if (pilot.phase.startsWith('recovery')) {
      if (this.pending || this.landing.state !== 'idle') this.recover(pilot.recoveryReason);
      this.state = pilot.phase;
      return commands;
    }
    if (pilot.phase === 'capture' && !this.pending && this.landing.state === 'idle') this.prepare(f);
    else if (!this.pending) this.state = pilot.phase;
    return commands;
  }
}

// Automatic ascent lifecycle: admission, the pilot's settings handover, and the stop conditions
// (vessel change, loss of control, 20 minutes without reaching the target orbit).
import {AscentPrototype, type AscentTarget} from './ascent-prototype.js';
import {PARTS} from './catalog.js';
import {ascentReadiness} from './ascent-readiness.js';
import {ascentPlane} from './ascent-plane.js';
import {bodyUp} from './celestial.js';
import type {Flight} from './core.js';
export interface AscentSettings {
  altitude: number;
  inclination: number;
}
export type AscentPilot = AscentPrototype;
/** The pilot settings an ascent takes over and gives back when it stops. */
export type AscentControlState = Pick<Flight, 'sas' | 'sasMode' | 'navigationAuto' | 'navigationFrame'>;

export class AscentSession {
  declare owner: Flight | null;
  declare pilot: AscentPilot | null;
  declare state: string;
  declare message: string;
  // Assigned by start(); they describe the ascent only while owner is set.
  declare previous: AscentControlState | undefined;
  declare elapsed: number;
  constructor() {
    this.owner = null;
    this.pilot = null;
    this.state = 'idle';
    this.message = '';
  }
  start(f: Flight, settings?: AscentTarget): void {
    if (this.owner) throw Error('Stop the current ascent first');
    const pilot = new AscentPrototype(settings);
    const reason = ascentReadiness(f);
    if (reason) throw Error(reason);
    pilot.plane = ascentPlane(
      bodyUp(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), f.universalTime),
      pilot.inclination
    );
    this.previous = {
      sas: f.sas,
      sasMode: f.sasMode,
      navigationAuto: f.navigationAuto,
      navigationFrame: f.navigationFrame
    };
    this.owner = f;
    this.pilot = pilot;
    this.elapsed = 0;
    this.state = 'running';
    this.message = '離昇';
  }
  stop(state = 'cancelled', message = '中止'): void {
    if (!this.owner) return;
    const f = this.owner;
    Object.assign(f, this.previous);
    f.holdQ = f.q.clone();
    f.throttle = 0;
    this.owner = null;
    this.pilot = null;
    this.state = state;
    this.message = message;
  }
  step(f: Flight, dt: number): void {
    if (!this.owner) return;
    if (f !== this.owner) {
      this.stop('cancelled', '機体切替');
      return;
    }
    if (!Number.isFinite(dt) || dt < 0) {
      this.stop('failed', '無効な時間刻み');
      return;
    }
    if (dt === 0) return;
    if (f.crashed || !f.parts.some(p => PARTS[p.type].control)) {
      this.stop('failed', '機体の制御を失いました');
      return;
    }
    this.elapsed += dt;
    if (this.elapsed > 1200) {
      this.stop('failed', '目標軌道に到達できませんでした');
      return;
    }
    if (!this.pilot) throw TypeError('No ascent pilot');
    this.pilot.update(f);
    this.message = this.pilot.message;
    if (this.pilot.done)
      this.stop(this.pilot.phase === '周回達成' ? 'complete' : 'failed', this.pilot.completionMessage);
  }
}

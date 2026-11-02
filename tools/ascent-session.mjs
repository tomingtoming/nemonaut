import {AscentPrototype} from './ascent-prototype.mjs';
import {PARTS} from '../dist/catalog.js';
import {ascentReadiness} from './ascent-readiness.mjs';
import {ascentPlane} from './ascent-plane.mjs';
import {bodyUp} from '../dist/celestial.js';

// Experimental lifecycle; product UI admission and manual-input wiring follow separately.
export class AscentSession {
  constructor() {
    this.owner = null;
    this.pilot = null;
    this.state = 'idle';
    this.message = '';
  }
  start(f, settings) {
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
  stop(state = 'cancelled', message = '中止') {
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
  step(f, dt) {
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
    this.pilot.update(f);
    this.message = this.pilot.message;
    if (this.pilot.done)
      this.stop(this.pilot.phase === '周回達成' ? 'complete' : 'failed', this.pilot.completionMessage);
  }
}

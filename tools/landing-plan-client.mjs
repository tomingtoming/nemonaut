import {saveFlight} from '../dist/flight-save.js';
import {bodyAltitude} from '../dist/celestial.js';
import {atmosphere} from '../dist/planet.js';
const density = f =>
  atmosphere(bodyAltitude(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), f.universalTime))
    .density;
const configuration = f =>
  JSON.stringify({
    parts: f.parts,
    active: [...f.active],
    ballast: f.ballast,
    reaction: f.reactionEnabled,
    steering: f.steeringEnabled
  });
export function landingPlanContext(f) {
  return {
    vesselId: f.vesselId,
    epoch: f.universalTime,
    configuration: configuration(f),
    mass: f.stats.mass,
    com: f.stats.com.clone(),
    density: density(f)
  };
}
export function landingPlanCurrent(f, c) {
  return (
    !f.crashed &&
    f.vesselId === c.vesselId &&
    f.universalTime >= c.epoch &&
    f.universalTime - c.epoch <= 30 &&
    configuration(f) === c.configuration &&
    Math.abs(f.stats.mass / c.mass - 1) <= 0.01 &&
    f.stats.com.distanceTo(c.com) < 0.05 &&
    Math.abs(density(f) / c.density - 1) <= 0.05
  );
}
export function validLandingPlan(p) {
  return (
    p &&
    ['speed', 'alpha', 'pitchCommand', 'throttle', 'density', 'gravity', 'mass', 'minimumSample'].every(k =>
      Number.isFinite(p[k])
    ) &&
    p.speed >= 40 &&
    p.speed <= 168 &&
    p.alpha >= 0 &&
    p.alpha <= 12 &&
    Math.abs(p.pitchCommand) <= 0.8 &&
    p.throttle >= 0 &&
    p.throttle <= 1 &&
    p.density > 0 &&
    p.gravity > 0 &&
    p.mass > 0 &&
    p.minimumSample >= 40 &&
    p.minimumSample <= 160
  );
}
export function landingPlanMatches(p, c) {
  return (
    validLandingPlan(p) &&
    Math.abs(p.mass / c.mass - 1) < 0.001 &&
    Math.abs(p.density / c.density - 1) < 0.001
  );
}
// Each request owns a worker, so even a synchronous search can be cancelled.
export class LandingPlanClient {
  constructor(makeWorker, {timeoutMs = 30000} = {}) {
    this.makeWorker = makeWorker;
    this.timeoutMs = timeoutMs;
    this.sequence = 0;
    this.pending = null;
  }
  cancel() {
    const p = this.pending;
    this.pending = null;
    if (p) {
      clearTimeout(p.timer);
      p.worker.terminate();
      p.resolve({status: 'cancelled'});
    }
  }
  request(f) {
    this.cancel();
    const context = landingPlanContext(f),
      flight = saveFlight(f),
      id = ++this.sequence,
      {vesselId, epoch} = context;
    return new Promise((resolve, reject) => {
      let worker;
      try {
        worker = this.makeWorker();
      } catch (error) {
        reject(error);
        return;
      }
      const p = {worker, resolve};
      this.pending = p;
      const finish = (error, result) => {
        if (this.pending !== p) return;
        this.pending = null;
        clearTimeout(p.timer);
        worker.terminate();
        error ? reject(error) : resolve(result);
      };
      p.timer = setTimeout(() => finish(Error('Landing planning timed out')), this.timeoutMs);
      worker.onmessage = ({data}) => {
        if (this.pending !== p) return;
        if (data.type === 'ready' && !p.sent) {
          p.sent = true;
          try {
            worker.postMessage({id, vesselId, epoch, flight});
          } catch (error) {
            finish(error);
          }
          return;
        }
        if (!p.sent || data.id !== id || data.vesselId !== vesselId || data.epoch !== epoch) return;
        if (!landingPlanCurrent(f, context)) {
          finish(null, {status: 'stale'});
          return;
        }
        if (data.error) {
          finish(Error(data.error));
          return;
        }
        const result = data.result;
        if (
          !result ||
          !['ready', 'unavailable'].includes(result.status) ||
          (result.status === 'ready' && !landingPlanMatches(result.plan, context))
        ) {
          finish(Error('Invalid landing plan'));
          return;
        }
        finish(null, {...result, context});
      };
      worker.onerror = () => finish(Error('Landing planning worker failed'));
    });
  }
}

// Client of the landing plan worker (landing-plan-worker.ts), and the checks that a returned trim
// plan still belongs to the vessel: same configuration, mass, centre of mass and air density.
import {saveFlight, type SavedFlight} from './flight-save.js';
import {bodyAltitude} from './celestial.js';
import {atmosphere} from './planet.js';
import type * as T from 'three';
import type {LandingPlan} from './landing-trim.js';
import type {WorkerFactory} from './takeoff-preview-client.js';
import type {Flight} from './core.js';
/** The vessel state a landing plan was computed for. */
export interface LandingPlanContext {
  vesselId: string;
  epoch: number;
  configuration: string;
  mass: number;
  com: T.Vector3;
  density: number;
}
/** What the client posts once the worker is ready; id, vesselId and epoch come back on the reply. */
export interface LandingPlanRequestMessage {
  id: number;
  vesselId: string;
  epoch: number;
  flight: SavedFlight;
}
export interface LandingPlanAnswer {
  status: 'ready' | 'unavailable';
  plan?: LandingPlan;
}
/** What the worker posts: {type: 'ready'} once after loading, then one reply with a result or an error. */
export interface LandingPlanReplyMessage {
  type?: string;
  id?: number;
  vesselId?: string;
  epoch?: number;
  result?: LandingPlanAnswer;
  error?: string;
}
/** A finished request: the plan with its context, or why there is none. */
export interface LandingPlanResult {
  status: LandingPlanAnswer['status'] | 'cancelled' | 'stale';
  plan?: LandingPlan;
  context?: LandingPlanContext;
}
interface PendingPlan {
  worker: Worker;
  resolve(result: LandingPlanResult | undefined): void;
  timer?: ReturnType<typeof setTimeout>;
  sent?: boolean;
}
type PlanFlight = Pick<
  Flight,
  | 'pos'
  | 'q'
  | 'stats'
  | 'universalTime'
  | 'parts'
  | 'active'
  | 'ballast'
  | 'reactionEnabled'
  | 'steeringEnabled'
  | 'vesselId'
  | 'crashed'
>;
const density = (f: PlanFlight): number =>
  atmosphere(bodyAltitude(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), f.universalTime))
    .density;
const configuration = (f: PlanFlight): string =>
  JSON.stringify({
    parts: f.parts,
    active: [...f.active],
    ballast: f.ballast,
    reaction: f.reactionEnabled,
    steering: f.steeringEnabled
  });
export function landingPlanContext(f: PlanFlight): LandingPlanContext {
  return {
    vesselId: f.vesselId,
    epoch: f.universalTime,
    configuration: configuration(f),
    mass: f.stats.mass,
    com: f.stats.com.clone(),
    density: density(f)
  };
}
export function landingPlanCurrent(f: PlanFlight, c: LandingPlanContext): boolean {
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
export function validLandingPlan(p: LandingPlan | null | undefined): p is LandingPlan {
  return (
    !!p &&
    (
      ['speed', 'alpha', 'pitchCommand', 'throttle', 'density', 'gravity', 'mass', 'minimumSample'] as const
    ).every(k => Number.isFinite(p[k])) &&
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
export function landingPlanMatches(
  p: LandingPlan | null | undefined,
  c: Pick<LandingPlanContext, 'mass' | 'density'>
): p is LandingPlan {
  return (
    validLandingPlan(p) &&
    Math.abs(p.mass / c.mass - 1) < 0.001 &&
    Math.abs(p.density / c.density - 1) < 0.001
  );
}
// Each request owns a worker, so even a synchronous search can be cancelled.
export class LandingPlanClient {
  declare makeWorker: WorkerFactory;
  declare timeoutMs: number;
  declare sequence: number;
  declare pending: PendingPlan | null;
  constructor(makeWorker: WorkerFactory, {timeoutMs = 30000}: {timeoutMs?: number} = {}) {
    this.makeWorker = makeWorker;
    this.timeoutMs = timeoutMs;
    this.sequence = 0;
    this.pending = null;
  }
  cancel(): void {
    const p = this.pending;
    this.pending = null;
    if (p) {
      clearTimeout(p.timer);
      p.worker.terminate();
      p.resolve({status: 'cancelled'});
    }
  }
  // Resolves undefined only if posting the request throws a falsy value.
  request(f: Flight): Promise<LandingPlanResult | undefined> {
    this.cancel();
    const context = landingPlanContext(f),
      flight = saveFlight(f),
      id = ++this.sequence,
      {vesselId, epoch} = context;
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = this.makeWorker();
      } catch (error) {
        reject(error);
        return;
      }
      const p: PendingPlan = {worker, resolve};
      this.pending = p;
      const finish = (error: unknown, result?: LandingPlanResult): void => {
        if (this.pending !== p) return;
        this.pending = null;
        clearTimeout(p.timer);
        worker.terminate();
        error ? reject(error) : resolve(result);
      };
      p.timer = setTimeout(() => finish(Error('Landing planning timed out')), this.timeoutMs);
      worker.onmessage = ({data}: MessageEvent<LandingPlanReplyMessage>) => {
        if (this.pending !== p) return;
        if (data.type === 'ready' && !p.sent) {
          p.sent = true;
          try {
            worker.postMessage({id, vesselId, epoch, flight} satisfies LandingPlanRequestMessage);
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

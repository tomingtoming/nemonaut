// Client of the takeoff forecast worker (takeoff-forecast-worker.ts).
// One worker per request allows cancellation during a synchronous physics roll.
// The caller must invalidate on manual input, settings changes and vessel switch.
import {
  createTakeoffRequest,
  type TakeoffRequest,
  type TakeoffPreview,
  type TakeoffPreviewOptions
} from './takeoff-preview.js';
import type {TakeoffPrototype} from './takeoff-prototype.js';
import type {Flight} from './core.js';
export type WorkerFactory = () => Worker;
/** What the client posts once the worker is ready; id, vesselId and epoch come back on the reply. */
export interface TakeoffRequestMessage {
  id: number;
  vesselId: string;
  epoch: number;
  payload: TakeoffRequest;
}
/** What the worker posts: {type: 'ready'} once after loading, then one reply with a result or an error. */
export interface TakeoffReplyMessage {
  type?: string;
  id?: number;
  vesselId?: string;
  epoch?: number;
  result?: TakeoffPreview;
  error?: string;
}
/** A finished request: the forecast, or why there is none (cancelled by the caller, or the flight moved on). */
export interface TakeoffForecast extends Partial<Omit<TakeoffPreview, 'status'>> {
  status: TakeoffPreview['status'] | 'cancelled' | 'stale';
  vesselId?: string;
  epoch?: number;
}
interface PendingForecast {
  worker: Worker;
  resolve(result: TakeoffForecast | undefined): void;
  reject(error: unknown): void;
  id: number;
  vesselId: string;
  epoch: number;
  timer?: ReturnType<typeof setTimeout>;
  sent?: boolean;
}
export class TakeoffPreviewClient {
  declare makeWorker: WorkerFactory;
  declare timeoutMs: number;
  declare maxAge: number;
  declare sequence: number;
  declare pending: PendingForecast | null;
  constructor(
    makeWorker: WorkerFactory,
    {timeoutMs = 15000, maxAge = 5}: {timeoutMs?: number; maxAge?: number} = {}
  ) {
    this.makeWorker = makeWorker;
    this.timeoutMs = timeoutMs;
    this.maxAge = maxAge;
    this.sequence = 0;
    this.pending = null;
  }
  cancel(): void {
    const old = this.pending;
    this.pending = null;
    if (old) {
      clearTimeout(old.timer);
      old.worker.terminate();
      old.resolve({status: 'cancelled'});
    }
  }
  // Resolves undefined only if posting the request throws a falsy value.
  request(
    f: Flight,
    p: TakeoffPrototype,
    options: TakeoffPreviewOptions = {}
  ): Promise<TakeoffForecast | undefined> {
    const payload = createTakeoffRequest(f, p, options);
    this.cancel();
    const id = ++this.sequence,
      vesselId = f.vesselId,
      epoch = f.universalTime;
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = this.makeWorker();
      } catch (error) {
        reject(error);
        return;
      }
      const pending: PendingForecast = {worker, resolve, reject, id, vesselId, epoch};
      this.pending = pending;
      const finish = (error: unknown, result?: TakeoffForecast): void => {
        if (this.pending !== pending) return;
        this.pending = null;
        clearTimeout(pending.timer);
        worker.terminate();
        error ? reject(error) : resolve(result);
      };
      pending.timer = setTimeout(() => finish(Error('Takeoff forecast timed out')), this.timeoutMs);
      worker.onmessage = ({data}: MessageEvent<TakeoffReplyMessage>) => {
        if (this.pending !== pending) return;
        if (data.type === 'ready' && !pending.sent) {
          pending.sent = true;
          try {
            worker.postMessage({id, vesselId, epoch, payload} satisfies TakeoffRequestMessage);
          } catch (error) {
            finish(error);
          }
          return;
        }
        if (!pending.sent) return;
        if (this.pending !== pending || data.id !== id || data.vesselId !== vesselId || data.epoch !== epoch)
          return;
        if (f.vesselId !== vesselId || f.universalTime < epoch || f.universalTime - epoch > this.maxAge) {
          finish(null, {status: 'stale'});
          return;
        }
        if (data.error) {
          finish(Error(data.error));
          return;
        }
        const r = data.result,
          lastGround = r?.lastGround;
        if (
          !r ||
          !['airborne', 'crashed', 'unresolved'].includes(r.status) ||
          (r.status === 'airborne' &&
            (!lastGround ||
              !(['along', 'cross', 'time'] as const).every(k => Number.isFinite(lastGround[k]))))
        ) {
          finish(Error('Invalid forecast result'));
          return;
        }
        finish(null, {...r, vesselId, epoch});
      };
      worker.onerror = () => finish(Error('Takeoff forecast worker failed'));
    });
  }
}

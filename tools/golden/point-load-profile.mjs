// Compare alternating requests in persistent Workers. The timer includes snapshot restore and disposal.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';

if (isMainThread) {
  const {Flight} = await import('../../dist/core.js');
  const {preset} = await import('../../dist/catalog.js');
  const {TakeoffPrototype} = await import('../takeoff-prototype.mjs');
  const {createTakeoffRequest} = await import('../takeoff-preview.mjs');
  const plane = new Flight(preset('transport-cargo'), 'runway', 161700);
  const workers = [];
  try {
    plane.stageNext();
    const payload = createTakeoffRequest(plane, new TakeoffPrototype(plane, {speed: 90}), {seconds: 1});
    for (const batch of [false, true]) {
      const worker = new Worker(new URL(import.meta.url), {workerData: batch});
      workers.push(worker);
      await once(worker, 'message');
    }
    const times = [[], []];
    let reference, counts;
    for (let i = 0; i < 11; i++) {
      for (const mode of i % 2 ? [1, 0] : [0, 1]) {
        workers[mode].postMessage(payload);
        const [message] = await once(workers[mode], 'message');
        reference ??= message.result;
        assert.deepEqual(message.result, reference);
        if (mode) counts = message.counts;
        if (i >= 4) times[mode].push(message.ms);
      }
    }
    assert.equal(reference.status, 'unresolved');
    assert.ok(reference.wheelTrack);
    console.log({times, callsPerForecast: counts});
  } finally {
    await Promise.all(workers.map(w => w.terminate()));
    plane.dispose();
  }
} else {
  const probe = workerData ? await import('./point-load-preload.mjs') : null;
  const {handleTakeoffRequest} = await import('../../dist/takeoff-forecast-worker.js');
  parentPort.on('message', payload => {
    const before = probe?.counts();
    const {vesselId, universalTime: epoch} = payload.flight;
    const start = performance.now();
    const response = handleTakeoffRequest({id: 1, vesselId, epoch, payload});
    const ms = performance.now() - start;
    if (response.error) throw Error(response.error);
    const {elapsedMs, ...result} = response.result;
    const counts = probe && Object.fromEntries(Object.entries(probe.counts()).map(([k,v]) => [k,v-before[k]]));
    parentPort.postMessage({result, ms, counts});
  });
  parentPort.postMessage('ready');
}

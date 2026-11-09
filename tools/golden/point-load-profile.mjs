// Each persistent worker executes both ships. Rotate mode order between measured rounds.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';

if (isMainThread) {
  const {Flight} = await import('../../dist/core.js');
  const {preset} = await import('../../dist/catalog.js');
  const {saveFlight} = await import('../../dist/flight-save.js');
  const {TakeoffPrototype} = await import('../takeoff-prototype.mjs');
  const {createTakeoffRequest} = await import('../takeoff-preview.mjs');
  const plane = new Flight(preset('transport-cargo'), 'runway', 161700);
  const rocket = new Flight(preset('rocket'), 'land', 161700);
  const workers = [];
  const modes = ['scalar', 'separate', 'direct', 'integrated'];
  try {
    plane.stageNext();
    rocket.stageNext();
    rocket.throttle = 1;
    const requests = {
      rocket: saveFlight(rocket),
      plane: createTakeoffRequest(plane, new TakeoffPrototype(plane, {speed: 90}), {seconds: 1})
    };
    for (const mode of modes) {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: mode,
        env: {...process.env, POINT_LOAD_MODE: mode}
      });
      workers.push(worker);
      await once(worker, 'message');
    }
    for (const [kind, payload] of Object.entries(requests)) {
      const times = modes.map(() => []);
      let reference;
      for (let round = 0; round < 12; round++) {
        for (let i = 0; i < modes.length; i++) {
          const mode = (round + i) % modes.length;
          workers[mode].postMessage({kind, payload});
          const [message] = await once(workers[mode], 'message');
          reference ??= message.result;
          assert.deepEqual(message.result, reference);
          if (round >= 4) times[mode].push(message.ms);
          if (round === 11 && mode === 3) console.log(kind, message.counts);
        }
      }
      if (kind === 'plane') {
        assert.equal(reference.status, 'unresolved');
        assert.ok(reference.wheelTrack);
      } else {
        assert.ok(reference.thrust > 0);
        assert.ok(reference.speed > 0);
      }
      console.log(
        kind,
        Object.fromEntries(
          modes.map((m, i) => {
            const sorted = times[i].sort((a, b) => a - b);
            return [m, (sorted[3] + sorted[4]) / 2];
          })
        )
      );
    }
  } finally {
    await Promise.all(workers.map(w => w.terminate()));
    plane.dispose();
    rocket.dispose();
  }
} else {
  const probe = workerData !== 'scalar' ? await import('./point-load-preload.mjs') : null;
  const {handleTakeoffRequest} = await import('../../dist/takeoff-forecast-worker.js');
  const {loadFlight} = await import('../../dist/flight-save.js');
  parentPort.on('message', ({kind, payload}) => {
    const before = probe?.counts();
    const start = performance.now();
    let result;
    if (kind === 'plane') {
      const {vesselId, universalTime: epoch} = payload.flight;
      const response = handleTakeoffRequest({id: 1, vesselId, epoch, payload});
      if (response.error) throw Error(response.error);
      const {elapsedMs, ...prediction} = response.result;
      result = prediction;
    } else {
      const craft = loadFlight(payload);
      try {
        for (let i = 0; i < 120; i++) craft.step(1 / 120);
        result = {
          p: craft.pos.toArray(),
          q: craft.q.toArray(),
          v: craft.vel.toArray(),
          w: craft.omega.toArray(),
          fuel: [...craft.fuel.values()],
          thrust: craft.lastThrust,
          speed: craft.telemetry.surfaceSpeed
        };
      } finally {
        craft.dispose();
      }
    }
    const ms = performance.now() - start;
    const counts =
      probe && Object.fromEntries(Object.entries(probe.counts()).map(([k, v]) => [k, v - before[k]]));
    parentPort.postMessage({result, ms, counts});
  });
  parentPort.postMessage('ready');
}

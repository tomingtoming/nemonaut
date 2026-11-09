// Run after building dist. Counts calls, so timings from this probe are not performance baselines.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';

const memories = [];
const calls = new Map();
const Instance = WebAssembly.Instance;
// Wrap the export table before importing the game, including inside the bundled forecast Worker.
WebAssembly.Instance = new Proxy(Instance, {
  construct(target, args) {
    const exports = {...new target(...args).exports};
    memories.push(exports.memory);
    for (const [name, fn] of Object.entries(exports)) {
      if (typeof fn !== 'function') continue;
      exports[name] = (...values) => {
        calls.set(name, (calls.get(name) ?? 0) + 1);
        return fn(...values);
      };
    }
    return {exports};
  }
});
function report() {
  return {
    instanceBytes: memories.map(m => m.buffer.byteLength),
    calls: [...calls.values()].reduce((a, b) => a + b, 0),
    top: Object.fromEntries([...calls].sort((a, b) => b[1] - a[1]).slice(0, 5))
  };
}

if (isMainThread) {
  const {Flight} = await import('../../dist/core.js');
  const {preset} = await import('../../dist/catalog.js');
  const {WorldRuntime} = await import('../../dist/world-runtime.js');
  const rocket = new Flight(preset('launcher'), 'orbit');
  try {
    const runtime = new WorldRuntime(rocket);
    for (const phase of ['ignition', 'separation']) {
      rocket.stageNext();
      runtime.replace(rocket);
      calls.clear();
      for (let i = 0; i < 120; i++) runtime.step(1 / 120);
      if (phase === 'separation') assert.ok(runtime.vessels.size > 1);
      console.log(phase, runtime.vessels.size, report());
    }
  } finally {
    rocket.dispose();
  }
  const {createTakeoffRequest} = await import('../takeoff-preview.mjs');
  const {TakeoffPrototype} = await import('../takeoff-prototype.mjs');
  const plane = new Flight(preset('transport-cargo'), 'runway', 161700);
  try {
    plane.stageNext();
    const payload = createTakeoffRequest(plane, new TakeoffPrototype(plane, {speed: 90}), {seconds: 1});
    const worker = new Worker(new URL(import.meta.url), {workerData: payload});
    try {
      const [message] = await once(worker, 'message');
      assert.equal(message.status, 'unresolved');
      assert.equal(plane.universalTime, payload.flight.universalTime);
      console.log('forecast (including restore and disposal)', message);
    } finally {
      await worker.terminate();
    }
  } finally {
    plane.dispose();
  }
} else {
  const {handleTakeoffRequest} = await import('../../dist/takeoff-forecast-worker.js');
  const {vesselId, universalTime: epoch} = workerData.flight;
  calls.clear();
  const response = handleTakeoffRequest({id: 1, vesselId, epoch, payload: workerData});
  if (response.error) throw Error(response.error);
  parentPort.postMessage({status: response.result.status, ...report()});
}

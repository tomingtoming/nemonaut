// Module worker that answers one takeoff forecast (takeoff-preview.ts) per request.
// tools/build.mjs bundles it with its imports: an import map does not apply inside a worker, so
// the bare 'three' specifier of the game modules would not resolve there.
import {loadPhysics} from './physics.js';
import {runTakeoffPreview} from './takeoff-preview.js';
import type {TakeoffRequestMessage, TakeoffReplyMessage} from './takeoff-preview-client.js';
export function handleTakeoffRequest({
  id,
  vesselId,
  epoch,
  payload
}: TakeoffRequestMessage): TakeoffReplyMessage {
  try {
    if (
      !Number.isInteger(id) ||
      id < 1 ||
      vesselId !== payload?.flight?.vesselId ||
      epoch !== payload?.flight?.universalTime
    )
      throw Error('Mismatched forecast snapshot');
    return {id, vesselId, epoch, result: runTakeoffPreview(payload)};
  } catch (error) {
    return {id, vesselId, epoch, error: error instanceof Error ? error.message : String(error)};
  }
}
// Forecasts use the same Rust physics as the game; ready is posted only after it loads.
await loadPhysics(new URL('./engine/orbital_engine.wasm', import.meta.url));
globalThis.onmessage = ({data}: MessageEvent<TakeoffRequestMessage>) =>
  globalThis.postMessage(handleTakeoffRequest(data));
// The client posts its request on ready, so ready must follow the handler installation.
// Node (the tests import handleTakeoffRequest) has no global postMessage.
if (typeof globalThis.postMessage === 'function') globalThis.postMessage({type: 'ready'});

// Module worker that answers one landing trim plan (landing-trim.ts) per request.
// tools/build.mjs bundles it with its imports: an import map does not apply inside a worker, so
// the bare 'three' specifier of the game modules would not resolve there.
import {loadPhysics} from './physics.js';
import {loadFlight} from './flight-save.js';
import {bodyAltitude, bodyGravity} from './celestial.js';
import {atmosphere} from './planet.js';
import {planLandingTrim} from './landing-trim.js';
import type {LandingPlanRequestMessage, LandingPlanReplyMessage} from './landing-plan-client.js';
import type {Flight} from './core.js';
export function handleLandingPlan({
  id,
  vesselId,
  epoch,
  flight
}: LandingPlanRequestMessage): LandingPlanReplyMessage {
  let clone: Flight | undefined;
  try {
    if (!Number.isInteger(id) || id < 1 || vesselId !== flight?.vesselId || epoch !== flight?.universalTime)
      throw Error('Mismatched landing snapshot');
    clone = loadFlight(flight);
    const center = clone.pos.clone().add(clone.stats.com.clone().applyQuaternion(clone.q));
    const plan = planLandingTrim(clone, {
      density: atmosphere(bodyAltitude(center, clone.universalTime)).density,
      gravity: bodyGravity(center, clone.universalTime).length()
    });
    return {id, vesselId, epoch, result: plan ? {status: 'ready', plan} : {status: 'unavailable'}};
  } catch (error) {
    return {id, vesselId, epoch, error: error instanceof Error ? error.message : String(error)};
  } finally {
    clone?.dispose();
  }
}
// Plans use the same Rust physics as the game; ready is posted only after it loads.
await loadPhysics(new URL('./engine/orbital_engine.wasm', import.meta.url));
globalThis.onmessage = ({data}: MessageEvent<LandingPlanRequestMessage>) =>
  globalThis.postMessage(handleLandingPlan(data));
// The client posts its request on ready, so ready must follow the handler installation.
// Node (the tests import handleLandingPlan) has no global postMessage.
if (typeof globalThis.postMessage === 'function') globalThis.postMessage({type: 'ready'});

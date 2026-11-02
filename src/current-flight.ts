// Access to the flight in progress (BACKLOG 7c, moved from app.ts unchanged): the controlled flight, the
// running world and the centre of mass of a vessel. No import-time side effects.
import {statistics, type Flight} from './core.js';
import type {WorldRuntime} from './world-runtime.js';
import {state} from './app-state.js';
export function currentFlight(): Flight {
  if (!state.flight) throw Error('飛行中の機体がありません');
  return state.flight;
}
export function currentWorldRuntime(): WorldRuntime {
  if (!state.worldRuntime) throw Error('飛行中の世界がありません');
  return state.worldRuntime;
}
export function vesselCenter(f: Flight) {
  return statistics(f.parts, f.fuel, f.ballast, f.thermal).com.applyQuaternion(f.q).add(f.pos);
}
export function flightCenter() {
  return vesselCenter(currentFlight());
}

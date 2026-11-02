import * as T from 'three';
import {runwayApproach} from './runway-navigation.js';
// Measure actual suspension contacts, including the wheel assembly's axle width.
// Wings extending beyond the pavement do not count as a wheel excursion.
export interface WheelTrack {
  minAlong: number;
  maxAlong: number;
  maxCross: number;
  samples: number;
}
export interface WheelContact {
  point: number[];
  halfAxle: number[];
  time: number;
}
export function extendWheelTrack(
  previous: WheelTrack | null | undefined,
  contacts: Iterable<WheelContact>
): WheelTrack | null {
  const track: WheelTrack = previous
    ? {...previous}
    : {minAlong: Infinity, maxAlong: -Infinity, maxCross: 0, samples: 0};
  for (const contact of contacts) {
    for (const sign of [-1, 1]) {
      const point = new T.Vector3()
        .fromArray(contact.point)
        .addScaledVector(new T.Vector3().fromArray(contact.halfAxle), sign);
      const r = runwayApproach(point, contact.time, '09');
      if (!r) continue;
      track.minAlong = Math.min(track.minAlong, -r.remaining);
      track.maxAlong = Math.max(track.maxAlong, -r.remaining);
      track.maxCross = Math.max(track.maxCross, Math.abs(r.crossTrack));
      track.samples++;
    }
  }
  return track.samples ? track : null;
}

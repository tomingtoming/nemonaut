// The one place that turns a vessel's statistics into its world-space centre of mass. `stats.com` is the
// physics truth (statistics() in core.ts: folded gear carries its mass into the body); every step refreshes
// it, as does every edit that moves mass (staging, docking, fuel transfer, gear, fracture, load). No
// import-time side effects.
import type * as T from 'three';
/** The vessel fields the centre of mass is read from. */
export interface MassCenteredVessel {
  stats: {com: T.Vector3};
  q: T.Quaternion;
  pos: T.Vector3;
}
/** World-space centre of mass (a new vector). */
export function centerOfMass(v: MassCenteredVessel): T.Vector3 {
  return v.stats.com.clone().applyQuaternion(v.q).add(v.pos);
}

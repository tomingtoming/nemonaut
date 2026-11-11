import {surfaceRelativeVelocity} from '../../dist/surface-frame.js';
/** Speed (m/s) of the vessel's mass centre relative to the rotating surface of the body below it. */
export const surfaceSpeed = f =>
  surfaceRelativeVelocity(
    f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),
    f.vel,
    f.universalTime
  ).length();

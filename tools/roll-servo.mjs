import * as T from 'three';
import {surfaceAngularVelocity} from '../dist/surface-frame.js';
// Experimental comparison with the existing quaternion servo (gain=4).
export function rollServo(f, target, gain = 4) {
  const inverse = f.q.clone().invert(),
    error = target.clone().multiply(inverse);
  if (error.w < 0) {
    error.x *= -1;
    error.y *= -1;
    error.z *= -1;
  }
  const local = new T.Vector3(error.x, error.y, error.z).applyQuaternion(inverse);
  const rate = f.omega.clone().sub(surfaceAngularVelocity()).applyQuaternion(inverse);
  return T.MathUtils.clamp(local.z * gain - rate.z * 1.5, -1, 1);
}

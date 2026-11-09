// Independent pre-migration wing calculation used by parity tests and benchmarks.
import * as T from 'three';
import {PARTS} from '../../dist/catalog.js';

export function surfaceForce(p, orientation, velocity, density, deflection = 0) {
  const d = PARTS[p.type],
    normal = new T.Vector3(0, 0, 1),
    forward = new T.Vector3(0, 1, 0),
    span = new T.Vector3(1, 0, 0);
  const hinge = new T.Quaternion().setFromAxisAngle(span, deflection);
  normal.applyQuaternion(hinge).applyQuaternion(orientation);
  forward.applyQuaternion(hinge).applyQuaternion(orientation);
  span.applyQuaternion(orientation);
  const flow = velocity.clone().addScaledVector(span, -velocity.dot(span)),
    speed = flow.length();
  if (speed < 0.05) return {force: new T.Vector3(), alpha: 0, cl: 0, stalled: false};
  const alpha = Math.atan2(-flow.dot(normal), flow.dot(forward)),
    a = Math.abs(alpha),
    stall = (15 * Math.PI) / 180;
  const cl =
    a <= stall
      ? 4.5 * alpha
      : Math.sign(alpha) * 1.18 * Math.cos(Math.min(Math.PI / 2, (a - stall) * 1.4));
  const cd = 0.022 + 0.065 * cl * cl + 1.2 * Math.sin(alpha) ** 2;
  const direction = flow.clone().normalize();
  const lift = normal.clone().addScaledVector(direction, -normal.dot(direction)).normalize();
  if (d.wing === undefined) throw Error('翼面積のない部品です');
  const q = 0.5 * density * speed * speed * d.wing;
  return {
    force: lift.multiplyScalar(q * cl).addScaledVector(direction, -q * cd),
    alpha,
    cl,
    stalled: a > stall
  };
}

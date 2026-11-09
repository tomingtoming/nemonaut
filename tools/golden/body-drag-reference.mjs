import * as T from 'three';
import {PARTS} from '../../dist/catalog.js';
import {bodyDragBoxes} from '../../dist/body-drag.js';
const axes = ['x', 'y', 'z'];
function hitBox(point, direction, box) {
  const wind = box.wind;
  if (!wind) throw Error('抗力計算の風向きが未設定です');
  const x = point.x - box.center.x,
    y = point.y - box.center.y,
    z = point.z - box.center.z;
  let near = -Infinity,
    far = Infinity;
  for (let i = 0; i < 3; i++) {
    const axis = box.axes[i],
      o = x * axis.x + y * axis.y + z * axis.z,
      d = wind[i],
      h = box.half[axes[i]];
    if (Math.abs(d) < 1e-10) {
      if (Math.abs(o) > h + 1e-8) return null;
    } else {
      const a = (-h - o) / d,
        b = (h - o) / d;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
    }
  }
  return far >= Math.max(near, 0) ? Math.max(near, 0) : null;
}
export function createBodyAerodynamics(parts, gearDeployed = true) {
  const boxes = bodyDragBoxes(parts, gearDeployed).map(box => ({
    ...box,
    inverse: box.rotation.clone().invert()
  }));
  let lastDirection = null,
    lastArea = 0;
  const maxCdArea = boxes.reduce(
    (sum, b) =>
      sum +
      4 *
        (b.half.x * b.half.y + b.half.y * b.half.z + b.half.z * b.half.x) *
        (PARTS[b.type].bodyDragShape === 'disc-y' ? 1.1 : 0.4),
    0
  );
  return {
    maxCdArea,
    dragArea(direction) {
      if (direction.lengthSq() < 1e-12) return 0;
      const wind = direction.clone().normalize();
      if (lastDirection && lastDirection.distanceToSquared(wind) < 1e-6) return lastArea;
      for (const box of boxes) box.wind = box.axes.map(a => a.dot(wind));
      let cdArea = 0;
      for (const box of boxes) {
        const local = wind.clone().applyQuaternion(box.inverse);
        for (let axis = 0; axis < 3; axis++) {
          const key = axes[axis],
            cos = Math.abs(local[key]);
          if (cos < 1e-6) continue;
          const u = axes[(axis + 1) % 3],
            v = axes[(axis + 2) % 3],
            sign = Math.sign(local[key]);
          let exposed = 0;
          for (let i = 0; i < 4; i++)
            for (let j = 0; j < 4; j++) {
              const p = new T.Vector3();
              p[key] = sign * box.half[key];
              p[u] = box.half[u] * ((i + 0.5) / 2 - 1);
              p[v] = box.half[v] * ((j + 0.5) / 2 - 1);
              p.applyQuaternion(box.rotation).add(box.center);
              const start = p.clone().addScaledVector(wind, 1e-7);
              if (!boxes.some(other => other !== box && hitBox(start, wind, other) !== null)) exposed++;
            }
          const round = PARTS[box.type].bodyDragShape === 'disc-y' && axis === 1 ? Math.PI / 4 : 1;
          const cd =
            PARTS[box.type].bodyDragShape === 'disc-y' && axis === 1
              ? 1.1
              : PARTS[box.type].streamlinedNose && axis === 1 && sign > 0
                ? 0.15
                : 0.4;
          cdArea += ((4 * box.half[u] * box.half[v] * cos * exposed) / 16) * round * cd;
        }
      }
      lastDirection = wind;
      lastArea = cdArea;
      return cdArea;
    }
  };
}

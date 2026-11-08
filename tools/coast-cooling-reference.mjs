import {PARTS} from '../dist/catalog.js';
import {THERMAL} from '../dist/thermal.js';
export function referenceCooling(parts, states, dt, air) {
  if (!Number.isFinite(dt) || dt <= 0) throw Error('冷却時間が不正です');
  for (const p of parts) {
    const d = PARTS[p.type],
      s = states.get(p.id),
      [x, y, z] = d.size;
    if (!s || !Number.isFinite(s.temperature) || s.temperature < 3) throw Error('真空冷却の温度が不正です');
    const surface = 2 * (x * y + y * z + z * x),
      capacity = Math.max(1, d.mass) * (d.heatCapacity || THERMAL.heatCapacity);
    const k = ((d.emissivity || THERMAL.emissivity) * THERMAL.sigma * surface) / capacity,
      convection = (air.density * 10 * surface) / capacity,
      ambient = air.density > 1e-9 ? air.temperature : 3;
    let left = dt,
      count = 0,
      t = s.temperature;
    while (left > 0) {
      if (++count > 10000) throw Error('真空冷却の計算上限です');
      const h = Math.min(left, 0.04 / (4 * k * Math.max(ambient, t) ** 3 + convection)),
        rate = n => -k * (n ** 4 - ambient ** 4) - convection * (n - ambient),
        mid = t + (rate(t) * h) / 2;
      t = Math.max(Math.min(t, ambient), Math.min(Math.max(t, ambient), t + rate(mid) * h));
      left -= h;
    }
    s.temperature = t;
  }
}

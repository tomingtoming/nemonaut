import {PARTS} from '../dist/catalog.js';
const engineMaxThrust = p => (PARTS[p.type].thrust || 0) * (p.thrustLimit ?? 1);
function vacuumIsp(p) {
  const isp = PARTS[p.type].isp;
  if (isp === void 0) throw Error('エンジンの比推力が定義されていません: ' + p.type);
  return isp;
}
function engineIsp(p, pressure = 0) {
  const d = PARTS[p.type],
    isp = vacuumIsp(p);
  return d.ispSeaLevel === void 0
    ? isp
    : isp + (d.ispSeaLevel - isp) * Math.max(0, Math.min(1, pressure / 101325));
}
export function referenceBurn(
  networks,
  fuel,
  active,
  throttle,
  density,
  dt,
  pressure = (density / 1.225) * 101325,
  intakeExposure
) {
  const thrust = new Map();
  for (const g of networks.groups) {
    const engines = g.engines.filter(p => active.has(p.id)),
      requested = engines.map(
        p =>
          engineMaxThrust(p) *
          throttle *
          (PARTS[p.type].oxidizerSource === 'atmosphere'
            ? (density / 1.225) * (intakeExposure?.(p) ?? 1)
            : engineIsp(p, pressure) / vacuumIsp(p))
      ),
      need = engines.reduce((s, p, i) => s + (requested[i] * dt) / (engineIsp(p, pressure) * 9.81), 0),
      available = g.tanks.reduce((s, p) => s + (fuel.get(p.id) || 0), 0),
      fraction = need > 0 ? Math.min(1, available / need) : 0;
    engines.forEach((p, i) => thrust.set(p.id, requested[i] * fraction));
    if (available > 0 && need > 0) {
      const remaining = need >= available ? 0 : 1 - need / available;
      for (const p of g.tanks) fuel.set(p.id, (fuel.get(p.id) || 0) * remaining);
    }
  }
  return thrust;
}

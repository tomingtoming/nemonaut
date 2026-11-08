import {PARTS} from '../dist/catalog.js';
// Frozen pre-migration TS oracle (d7f1320); used only for parity checks.
export function referenceCharge(parts, charge, generation, demand, dt) {
  const stored = parts.reduce((s, p) => s + (charge.get(p.id) || 0), 0),
    capacity = parts.reduce((s, p) => s + (PARTS[p.type].battery || 0), 0),
    available = stored + generation * dt,
    consumed = Math.min(available, demand * dt),
    ratio = demand > 0 ? Math.min(1, available / (demand * dt)) : 1,
    next = Math.max(0, Math.min(capacity, available - consumed)),
    change = next - stored;
  for (const p of parts) {
    const cap = PARTS[p.type].battery || 0;
    if (!cap) continue;
    const current = charge.get(p.id) || 0,
      share =
        change >= 0
          ? capacity > stored
            ? (cap - current) / (capacity - stored)
            : 0
          : stored
            ? current / stored
            : 0;
    charge.set(p.id, Math.max(0, Math.min(cap, current + change * share)));
  }
  return {
    stored: next,
    capacity,
    generation,
    demand,
    consumption: consumed / dt,
    ratio,
    net: change / dt
  };
}

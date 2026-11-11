import {resolveVesselCollisions} from './vessel-collision.js';
// The scheduler owns the epoch and reads every target at the same step boundary.
// It accepts a flat fleet; neither its order nor its selected vessel owns time.
export function advanceWorldPhysics(
  vessels: readonly import('./core.js').Flight[],
  universalTime: number,
  dt: number,
  activeVesselId: string,
  input: import('./core.js').FlightInput = {}
): number {
  if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(universalTime) || universalTime < 0)
    throw Error('物理更新の時刻が不正です');
  const ids = new Set();
  for (const v of vessels) {
    if (ids.has(v.vesselId) || v.universalTime !== universalTime)
      throw Error('世界の機体IDまたは共通時刻が不一致です');
    ids.add(v.vesselId);
  }
  if (!ids.has(activeVesselId)) throw Error('操縦対象が世界に存在しません');
  const snapshots = new Map<import('./core.js').Flight | null, import('./core.js').FlightTarget>(
    vessels.map(v => [
      v,
      {
        parts: v.parts,
        stats: v.stats,
        pos: v.pos.clone(),
        q: v.q.clone(),
        vel: v.vel.clone(),
        omega: v.omega.clone(),
        fuel: new Map(v.fuel),
        ballast: v.ballast,
        thermal: new Map<string, import('./thermal.js').ThermalState>(
          [...v.thermal].map(([id, s]) => [id, {...s}])
        )
      }
    ])
  );
  const endTime = universalTime + dt;
  for (const v of vessels) v.universalTime = endTime;
  try {
    for (const v of vessels)
      v.stepBody(dt, v.vesselId === activeVesselId ? input : {}, snapshots.get(v.navigationTarget) ?? null);
  } catch (error) {
    // The caller keeps its clock when a step fails; vessels left ahead of it would be rejected forever.
    for (const v of vessels) v.universalTime = universalTime;
    throw error;
  }
  // Vessels step in separate worlds; contacts between them are resolved afterwards.
  resolveVesselCollisions(vessels, dt);
  return endTime;
}

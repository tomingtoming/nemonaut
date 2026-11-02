import {fleet, type FleetNode} from './fleet.js';
import {bodyOrbitState} from './celestial.js';
import {descentTelemetry, type DescentVessel} from './descent.js';
import {appendHistory, type WorldHistoryEvent} from './world-history.js';
import {launchOrigins, surfaceOrigins} from './launch-provenance.js';

// Called with observed simulation states, including after coast updates.
// Surface-launch lineage survives staging; placed/unknown parts earn nothing.
/** The vessel fields lunar achievement recording reads. */
export interface LunarAchievementVessel extends DescentVessel, FleetNode<LunarAchievementVessel> {
  vesselId: string;
  vesselName?: string | null;
  crashed?: boolean;
  landed?: boolean;
  time: number;
}
export function recordLunarAchievements(
  history: readonly WorldHistoryEvent[],
  root: LunarAchievementVessel | null | undefined,
  {practice = false}: {practice?: boolean} = {}
): readonly WorldHistoryEvent[] {
  if (practice || !root) return history;
  const origins = launchOrigins(history),
    recorded = new Set(history.map(e => e.type + ':' + e.vesselId));
  const arrivedParts = new Set(history.filter(e => e.type === 'moon-arrival').flatMap(e => e.partIds));
  let result = history;
  for (const vessel of fleet(root)) {
    if (vessel.crashed || vessel.time <= 0) continue;
    const sources = surfaceOrigins(
      vessel.parts.map(p => p.id),
      origins
    );
    if (!sources) continue;
    const center = vessel.stats.com.clone().applyQuaternion(vessel.q).add(vessel.pos);
    const orbit = bodyOrbitState(center, vessel.vel, vessel.universalTime);
    if (orbit.bodyId !== 'moon' || orbit.altitude < 0) continue;
    const write = (type: string) => {
      const key = type + ':' + vessel.vesselId;
      if (recorded.has(key) && (type === 'moon-landing' || vessel.parts.every(p => arrivedParts.has(p.id))))
        return;
      result = appendHistory(
        {history: result, universalTime: root.universalTime},
        type,
        {
          vesselId: vessel.vesselId,
          vesselName: vessel.vesselName,
          state: {time: vessel.time},
          parts: vessel.parts
        },
        {launchEventIds: sources}
      );
      recorded.add(key);
      if (type === 'moon-arrival') for (const p of vessel.parts) arrivedParts.add(p.id);
    };
    write('moon-arrival');
    if (vessel.landed && orbit.speed < 1) {
      const descent = descentTelemetry(vessel);
      if (Math.abs(descent.clearance) < 0.5) write('moon-landing');
    }
  }
  return result;
}

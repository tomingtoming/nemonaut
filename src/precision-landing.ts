import {PARTS} from './catalog.js';
import {fleet, type FleetNode} from './fleet.js';
import {surfaceClearance, type DescentVessel} from './descent.js';
import {surfaceRelativeVelocity} from './surface-frame.js';
import {launchOrigins, surfaceOrigins} from './launch-provenance.js';
import {appendHistory, type WorldHistoryEvent} from './world-history.js';
import {DELIVERY_SITES, deliveryDistance, type DeliverySite} from './delivery-sites.js';
import {PRECISION_ALTITUDE, flightPhases, phaseSources} from './flight-challenge-history.js';
import {centerOfMass} from './center-of-mass.js';

export interface PrecisionStatusVessel {
  parts: readonly {id: string}[];
  crashed?: boolean;
  thermal: ReadonlyMap<string, {failed: boolean}>;
}
export interface ChallengeVessel extends DescentVessel, FleetNode<ChallengeVessel> {
  crashed?: boolean;
  landed?: boolean;
  thermal: ReadonlyMap<string, {failed: boolean}>;
  telemetry: {groundContact?: boolean};
  orbit?: {bodyId: string; altitude: number} | null;
  time: number;
  vesselId: string;
  vesselName?: string | null;
}
interface ChallengeEvidence {
  origins: Map<string, WorldHistoryEvent>;
  phases: Map<string, WorldHistoryEvent>;
}
const cache = new WeakMap<readonly WorldHistoryEvent[], ChallengeEvidence>();
function evidence(history: readonly WorldHistoryEvent[]): ChallengeEvidence {
  let found = cache.get(history);
  if (!found) {
    found = {origins: launchOrigins(history), phases: flightPhases(history)};
    cache.set(history, found);
  }
  return found;
}
export function precisionLandingStatus(
  v: PrecisionStatusVessel | null | undefined,
  history: readonly WorldHistoryEvent[],
  site: DeliverySite
): string {
  const done = history.find(e => e.type === 'precision-landing' && e.siteId === site.id);
  if (done) return '✓ 精密着陸 · ' + done.name;
  if (!v) return '対地100 m以上から円内へ着陸';
  const ids = v.parts.map(p => p.id),
    {origins, phases} = evidence(history);
  if (!surfaceOrigins(ids, origins)) return '通常出発が必要';
  if (v.crashed || [...v.thermal.values()].some(s => s.failed)) return '機体損傷';
  const touchdowns = phaseSources(ids, phases, 'flight-touchdown');
  if (touchdowns)
    return touchdowns.some(
      e => e.siteId !== site.id || (e.distance !== undefined && e.distance > site.radius) || e.damaged
    )
      ? '円外に接地 · 再上昇して再挑戦'
      : '円内に接地 · 停止待ち';
  return phaseSources(ids, phases, 'flight-ascent') ? '高度条件達成 · 円内へ着陸' : '対地100 m以上へ上昇';
}
// Called after every physical step: contact must be captured before wheel rollout.
export function recordFlightChallenges(
  history: readonly WorldHistoryEvent[],
  root: ChallengeVessel | null | undefined,
  {practice = false}: {practice?: boolean} = {}
): readonly WorldHistoryEvent[] {
  if (practice || !root) return history;
  let next = history;
  for (const v of fleet(root)) {
    if (v.time <= 0 || !v.parts.some(p => PARTS[p.type].control)) continue;
    const ids = v.parts.map(p => p.id),
      {origins, phases} = evidence(next),
      sources = surfaceOrigins(ids, origins);
    if (!sources) continue;
    const airborne = phaseSources(ids, phases, 'flight-ascent'),
      touchdowns = phaseSources(ids, phases, 'flight-touchdown');
    const damaged = v.crashed || [...v.thermal.values()].some(s => s.failed);
    const center = centerOfMass(v);
    let type: string | undefined, data: Partial<WorldHistoryEvent> | undefined;
    if (airborne && v.telemetry.groundContact && v.orbit?.bodyId === 'planet') {
      const nearest = DELIVERY_SITES.map(site => ({
        site,
        distance: deliveryDistance(center, v.universalTime, site)
      })).sort((a, b) => a.distance - b.distance)[0];
      type = 'flight-touchdown';
      data = {
        siteId: nearest.site.id,
        distance: nearest.distance,
        damaged,
        flightEventIds: airborne.map(e => e.id)
      };
    } else if (
      !damaged &&
      !airborne &&
      !v.telemetry.groundContact &&
      v.orbit?.bodyId === 'planet' &&
      v.orbit.altitude >= PRECISION_ALTITUDE
    ) {
      const d = surfaceClearance(v);
      if (d.clearance >= PRECISION_ALTITUDE) {
        type = 'flight-ascent';
        data = {clearance: d.clearance};
      }
    } else if (!damaged && touchdowns && v.landed) {
      const site = DELIVERY_SITES.find(s =>
        touchdowns.every(
          e => e.siteId === s.id && !e.damaged && e.distance !== undefined && e.distance <= s.radius
        )
      );
      if (!site || next.some(e => e.type === 'precision-landing' && e.siteId === site.id)) continue;
      const distance = deliveryDistance(center, v.universalTime, site),
        speed = surfaceRelativeVelocity(center, v.vel, v.universalTime).length();
      if (distance <= site.radius && speed < 0.5 && Math.abs(surfaceClearance(v).clearance) < 0.5) {
        type = 'precision-landing';
        data = {siteId: site.id, distance, speed, damaged: false, flightEventIds: touchdowns.map(e => e.id)};
      }
    }
    if (type)
      next = appendHistory(
        {history: next, universalTime: root.universalTime},
        type,
        {vesselId: v.vesselId, vesselName: v.vesselName, state: {time: v.time}, parts: v.parts},
        {launchEventIds: sources, challenge: data}
      );
  }
  return next;
}

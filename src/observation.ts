import {PARTS} from './catalog.js';
import * as T from 'three';
import {DELIVERY_SITE, DELIVERY_SITES, deliveryDistance, type DeliverySite} from './delivery-sites.js';
import {surfaceRelativeVelocity} from './surface-frame.js';
import {descentTelemetry, type DescentVessel} from './descent.js';
import {centerOfMass} from './center-of-mass.js';
export const OBSERVATION_POWER = 0.1;
/** Accumulated observation seconds (and their quality) at one delivery site. */
export interface ObservationRecord {
  day: number;
  night: number;
  quality?: Record<
    import('./observation-quality.js').ObservationPeriod,
    import('./observation-quality.js').ObservationInterval
  >;
}
/** Per-probe observation state; the default site lives on the record itself, others under sites. */
export interface ObservationState extends ObservationRecord {
  enabled: boolean;
  sites?: Record<string, ObservationRecord>;
}
export type ObservationMap = Map<string, ObservationState>;
/** The vessel fields observationDemand reads. */
export interface ObservationDemandVessel {
  crashed?: boolean;
  thermal: ReadonlyMap<string, {failed: boolean}>;
  observations: ReadonlyMap<string, ObservationState>;
}
/** The vessel fields observationSite reads. */
export interface ObservationSiteVessel {
  parts: readonly Pick<import('./catalog.js').Part, 'id' | 'p'>[];
  q: T.Quaternion;
  pos: T.Vector3;
  universalTime: number;
}
/** The vessel fields observationReason and advanceObservations read. */
export interface ObservationVessel extends DescentVessel, ObservationDemandVessel {
  crashed?: boolean;
  landed?: boolean;
}
/** The vessel (live or saved world record) fields observationStatus reads. */
// What the status needs before the pause check (saved world vessels too); live vessels are recognised at runtime below.
export interface ObservationStatusVessel {
  state?: {crashed?: boolean} | null;
  crashed?: boolean;
  thermal?: Iterable<readonly [string, {failed?: boolean}]> | null;
  observations?: Iterable<readonly [string, ObservationState]> | null;
}
type LiveObservationVessel = ObservationStatusVessel &
  ObservationVessel & {
    telemetry: {power?: Pick<import('./power.js').PowerReading, 'ratio' | 'eclipse'> | null};
  };
export function createObservations(
  parts: readonly Pick<import('./catalog.js').Part, 'id' | 'type'>[]
): ObservationMap {
  return new Map<string, ObservationState>(
    parts
      .filter(p => PARTS[p.type].surfaceObservation === true)
      .map(p => [p.id, {enabled: false, day: 0, night: 0}])
  );
}
export function observationDemand(
  v: ObservationDemandVessel,
  states: ReadonlyMap<string, ObservationState> = v.observations
): number {
  return v.crashed
    ? 0
    : [...states].filter(([id, s]) => s.enabled && !v.thermal.get(id)?.failed).length * OBSERVATION_POWER;
}
export function observationSite(v: ObservationSiteVessel, id: string): DeliverySite | null {
  const p = v.parts.find(p => p.id === id);
  if (!p) return null;
  const point = new T.Vector3(...p.p).applyQuaternion(v.q).add(v.pos);
  return DELIVERY_SITES.find(site => deliveryDistance(point, v.universalTime, site) <= site.radius) ?? null;
}
export function observationData(
  state: ObservationState | undefined,
  site: DeliverySite = DELIVERY_SITE
): ObservationRecord | undefined {
  return site.id === DELIVERY_SITE.id ? state : (state?.sites?.[site.id] ?? {day: 0, night: 0});
}
export function observationReason(v: ObservationVessel, id: string): string {
  const p = v.parts.find(p => p.id === id),
    s = v.observations.get(id);
  if (!p || !s) return '観測装置なし';
  if (v.crashed || v.thermal.get(id)?.failed) return '機体損傷';
  if (!s.enabled) return '停止中';
  const com = centerOfMass(v);
  if (!observationSite(v, id)) return '観測点の範囲外';
  if (!v.landed || surfaceRelativeVelocity(com, v.vel, v.universalTime).length() >= 0.5)
    return '接地・静止待ち';
  const d = descentTelemetry(v);
  if (d.body !== 'planet' || Math.abs(d.clearance) > 0.5) return '接地・静止待ち';
  return '';
}
export function advanceObservations(
  v: ObservationVessel,
  states: Map<string, ObservationState>,
  power: Pick<import('./power.js').PowerReading, 'ratio' | 'eclipse'>,
  dt: number
): void {
  for (const [id, s] of states) {
    if (!s.enabled || observationReason({...v, observations: states}, id)) continue;
    const site = observationSite(v, id);
    if (!site) continue;
    const data = site.id === DELIVERY_SITE.id ? s : ((s.sites ??= {})[site.id] ??= {day: 0, night: 0});
    const key = power.eclipse ? 'night' : 'day';
    data[key] = Math.min(1e12, data[key] + dt * power.ratio);
    const quality = (data.quality ??= {day: {received: 0, missed: 0}, night: {received: 0, missed: 0}});
    quality[key].received = Math.min(1e12, quality[key].received + dt * power.ratio);
    quality[key].missed = Math.min(1e12, quality[key].missed + dt * (1 - power.ratio));
  }
}

// Past the paused check only a live vessel is read, whose thermal and observation states are Maps.
function isLiveObservationVessel(v: ObservationStatusVessel): v is LiveObservationVessel {
  return v.thermal instanceof Map && v.observations instanceof Map && 'telemetry' in v && 'stats' in v;
}
export function observationStatus(
  v: ObservationStatusVessel,
  id: string,
  {paused = false}: {paused?: boolean} = {}
): string {
  const state = v.state ?? v,
    thermal = new Map<string, {failed?: boolean}>(v.thermal ?? []),
    observation = new Map<string, ObservationState>(v.observations ?? []).get(id);
  if (state.crashed || thermal.get(id)?.failed) return '機体損傷';
  if (!observation) return '観測装置なし';
  if (!observation.enabled) return '停止中';
  if (paused) return '観測ON · 時間停止中';
  if (!isLiveObservationVessel(v)) throw Error('観測状態を確認できません');
  const reason = observationReason(v, id);
  if (reason) return reason;
  const power = v.telemetry.power;
  if (!power) return '給電確認中';
  if (power.ratio <= 0) return '電力不足 · 観測停止';
  const period = power.eclipse ? '夜間' : '日照';
  return power.ratio < 0.999
    ? '電力不足 · ' + period + ' ' + Math.round(power.ratio * 100) + '%で観測'
    : period + 'を観測中';
}

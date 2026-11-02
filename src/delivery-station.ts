import {powerTotals} from './power.js';
import * as T from 'three';
import {DELIVERY_SITE, deliveryDistance, type DeliverySite} from './delivery-sites.js';
export interface DeliveryRecord {
  type: string;
  siteId?: string;
  probePartId?: string;
}
export interface StationState {
  crashed?: boolean;
  landed?: boolean;
}
export interface StationVessel extends StationState {
  parts: readonly Pick<import('./catalog.js').Part, 'id' | 'type' | 'p'>[];
  pos: T.Vector3Tuple | T.Vector3;
  q: T.QuaternionTuple | T.Quaternion;
  state?: StationState | null;
  charge?: Iterable<readonly [string, number]> | null;
  thermal?: Iterable<readonly [string, {failed?: boolean}]> | null;
  universalTime: number;
}
export interface DeliveryStation<R, V> {
  record: R;
  vessel: V;
  power: {stored: number; capacity: number};
  distance: number;
  charge: number;
  damaged: boolean | undefined;
  landed: boolean | undefined;
}
export interface LostDeliveryStation<R> {
  record: R;
  vessel: null;
  power?: undefined;
  distance?: undefined;
  charge?: undefined;
  damaged?: undefined;
  landed?: undefined;
}
// Follow the recorded probe part across separation/docking and vessel renames.
// Accept live vessels or saved world vessels without constructing a simulation.
export function deliveryStation<R extends DeliveryRecord, V extends StationVessel>(
  history: readonly R[],
  vessels: readonly V[],
  site: DeliverySite = DELIVERY_SITE
): DeliveryStation<R, V> | LostDeliveryStation<R> | null {
  const record = history.find(e => e.type === 'delivery' && e.siteId === site.id);
  if (!record) return null;
  const vessel = vessels.find(v => v.parts.some(p => p.id === record.probePartId && p.type === 'probe'));
  if (!vessel) return {record, vessel: null};
  const probe = vessel.parts.find(p => p.id === record.probePartId);
  if (!probe) throw Error('配達した探査コアが見つかりません');
  const pos = Array.isArray(vessel.pos) ? new T.Vector3(...vessel.pos) : vessel.pos,
    q = Array.isArray(vessel.q) ? new T.Quaternion(...vessel.q) : vessel.q;
  const point = new T.Vector3(...probe.p).applyQuaternion(q).add(pos),
    state = vessel.state ?? vessel,
    charge = new Map<string, number>(vessel.charge),
    thermal = new Map<string, {failed?: boolean}>(vessel.thermal);
  return {
    record,
    vessel,
    power: powerTotals(vessel.parts, charge),
    distance: deliveryDistance(point, vessel.universalTime, site),
    charge: charge.get(probe.id) ?? 0,
    damaged: state.crashed || [...thermal.values()].some(s => s.failed),
    landed: state.landed
  };
}

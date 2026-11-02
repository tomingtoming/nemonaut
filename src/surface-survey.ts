import {observationData, type ObservationState} from './observation.js';
import {DELIVERY_SITE, DELIVERY_SITES, SURVEY_TARGET_SECONDS, type DeliverySite} from './delivery-sites.js';
import {
  deliveryStation,
  type StationVessel,
  type DeliveryStation,
  type LostDeliveryStation
} from './delivery-station.js';
import {fleet, type FleetNode} from './fleet.js';
import {appendHistory, type WorldHistoryEvent} from './world-history.js';
/** A live or saved vessel that may carry a delivered probe. */
/** The vessel fields surveyProgress reads. */
export interface SurveyStationVessel extends StationVessel {
  observations?: Iterable<readonly [string, ObservationState]> | null;
}
export interface SurveyVessel extends SurveyStationVessel {
  vesselId: string;
  vesselName?: string | null;
  time: number;
}
export interface SurveyRoot extends SurveyVessel, FleetNode<SurveyRoot> {}
export interface SurveyProgress<V extends SurveyStationVessel = SurveyVessel> {
  completed: WorldHistoryEvent | undefined;
  station: DeliveryStation<WorldHistoryEvent, V> | LostDeliveryStation<WorldHistoryEvent> | null;
  quality: WorldHistoryEvent['quality'];
  day: number;
  night: number;
}
export function surveyProgress<V extends SurveyStationVessel = SurveyVessel>(
  history: readonly WorldHistoryEvent[],
  vessels: readonly V[],
  site: DeliverySite = DELIVERY_SITE
): SurveyProgress<V> {
  const completed = history.find(e => e.type === 'survey' && e.siteId === site.id),
    station = deliveryStation(history, vessels, site),
    data = station?.vessel
      ? observationData(
          new Map<string | undefined, ObservationState>(station.vessel.observations ?? []).get(
            station.record.probePartId
          ),
          site
        )
      : null;
  return {
    completed,
    station,
    quality: data?.quality ?? completed?.quality,
    day: data?.day ?? completed?.day ?? 0,
    night: data?.night ?? completed?.night ?? 0
  };
}
export function recordSurveyAchievement(
  history: readonly WorldHistoryEvent[],
  root: SurveyRoot | null | undefined,
  {practice = false}: {practice?: boolean} = {}
): readonly WorldHistoryEvent[] {
  if (practice || !root) return history;
  for (const site of DELIVERY_SITES) {
    const p = surveyProgress(history, fleet(root), site);
    if (
      p.completed ||
      !p.station?.vessel ||
      p.station.damaged ||
      p.day < SURVEY_TARGET_SECONDS ||
      p.night < SURVEY_TARGET_SECONDS
    )
      continue;
    const v = p.station.vessel;
    return appendHistory(
      {history, universalTime: root.universalTime},
      'survey',
      {vesselId: v.vesselId, vesselName: v.vesselName, state: {time: v.time}, parts: v.parts},
      {
        survey: {
          siteId: site.id,
          probePartId: p.station.record.probePartId,
          deliveryEventId: p.station.record.id,
          day: p.day,
          night: p.night,
          ...(p.quality ? {quality: structuredClone(p.quality)} : {})
        }
      }
    );
  }
  return history;
}

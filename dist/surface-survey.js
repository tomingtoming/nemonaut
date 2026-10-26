import {observationData} from './observation.js';
import {DELIVERY_SITE,DELIVERY_SITES,SURVEY_TARGET_SECONDS} from './delivery-sites.js';
import {deliveryStation} from './delivery-station.js';
import {fleet} from './fleet.js';
import {appendHistory} from './world-history.js';
export function surveyProgress(history,vessels,site=DELIVERY_SITE){
 const completed=history.find(e=>e.type==='survey'&&e.siteId===site.id),station=deliveryStation(history,vessels,site),data=station?.vessel?observationData(new Map(station.vessel.observations??[]).get(station.record.probePartId),site):null;
 return {completed,station,day:data?.day??completed?.day??0,night:data?.night??completed?.night??0};
}
export function recordSurveyAchievement(history,root,{practice=false}={}){
 if(practice||!root)return history;
 for(const site of DELIVERY_SITES){const p=surveyProgress(history,fleet(root),site);if(p.completed||!p.station?.vessel||p.station.damaged||p.day<SURVEY_TARGET_SECONDS||p.night<SURVEY_TARGET_SECONDS)continue;
 const v=p.station.vessel;
 return appendHistory({history,universalTime:root.universalTime},'survey',{vesselId:v.vesselId,vesselName:v.vesselName,state:{time:v.time},parts:v.parts},{survey:{siteId:site.id,probePartId:p.station.record.probePartId,deliveryEventId:p.station.record.id,day:p.day,night:p.night}});
 }return history;
}

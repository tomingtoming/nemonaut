import {DELIVERY_SITE,SURVEY_TARGET_SECONDS} from './delivery-sites.js';
import {deliveryStation} from './delivery-station.js';
import {fleet} from './fleet.js';
import {appendHistory} from './world-history.js';
export function surveyProgress(history,vessels){
 const completed=history.find(e=>e.type==='survey'&&e.siteId===DELIVERY_SITE.id),station=deliveryStation(history,vessels),data=station?.vessel?new Map(station.vessel.observations??[]).get(station.record.probePartId):null;
 return {completed,station,day:data?.day??completed?.day??0,night:data?.night??completed?.night??0};
}
export function recordSurveyAchievement(history,root,{practice=false}={}){
 if(practice||!root)return history;
 const p=surveyProgress(history,fleet(root));if(p.completed||!p.station?.vessel||p.station.damaged||p.day<SURVEY_TARGET_SECONDS||p.night<SURVEY_TARGET_SECONDS)return history;
 const v=p.station.vessel;
 return appendHistory({history,universalTime:root.universalTime},'survey',{vesselId:v.vesselId,vesselName:v.vesselName,state:{time:v.time},parts:v.parts},{survey:{siteId:DELIVERY_SITE.id,probePartId:p.station.record.probePartId,deliveryEventId:p.station.record.id,day:p.day,night:p.night}});
}

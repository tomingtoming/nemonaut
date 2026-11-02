import {appendHistory} from './world-history.js';
import {validateWorld,worldFromFlight,flightFromWorld,type SavedWorld,type WorldVessel} from './world-save.js';
import {launchIntoFleet,type LaunchRequest} from './launch-fleet.js';
import {saveFlight} from './flight-save.js';
import {trackingList,type TrackingOptions,type TrackingRow} from './tracking.js';
import {retireVessel} from './vessel-recovery.js';
import {canControl} from './fleet.js';

function vessel(world:SavedWorld,id:string):WorldVessel{
 const found=world.vessels.find(v=>v.vesselId===id);
 if(!found)throw Error('対象の機体が世界に存在しません');
 return found;
}
// Operations own no editor state. Every result is an independent world; callers
// adopt it only after the operation succeeds, and can keep the original on error.
export function launchWorld(value:SavedWorld,design:LaunchRequest):SavedWorld{
 const world=validateWorld(value);
 if(design.universalTime!==undefined&&design.universalTime!==world.universalTime)throw Error('出発時刻が世界と一致しません');
 const launched=launchIntoFleet(flightFromWorld(world),{...design,universalTime:world.universalTime});
 try{const next=worldFromFlight(saveFlight(launched,{name:launched.vesselName,pilot:null}),{history:world.history});const active=next.vessels.find(v=>v.vesselId===next.activeVesselId);if(!active)throw Error('出発した機体が世界に見つかりません');next.history=appendHistory(next,'launch',active);return next;}
 finally{launched.dispose();}
}
export function selectWorldVessel(value:SavedWorld,id:string,{observe=false}:{observe?:boolean}={}):{world:SavedWorld;observe:string|null}{
 const world=validateWorld(value),target=vessel(world,id);
 if(observe)return {world,observe:id};
 if(!canControl({parts:target.parts,crashed:target.state.crashed}))throw Error('制御装置のない機体・損傷した機体は操縦できません');
 world.activeVesselId=id;world.flightMeta={...world.flightMeta,name:target.vesselName,pilot:null};
 return {world,observe:null};
}
export type WorldTrackingRow=Omit<TrackingRow,'id'>&{anchorPartId:string;id:string|undefined};
export function worldTrackingList(value:SavedWorld|null|undefined,options?:TrackingOptions):WorldTrackingRow[]{
 if(!value)return [];
 const world=validateWorld(value),owners=new Map(world.vessels.flatMap(v=>v.parts.map((p):[string,string]=>[p.id,v.vesselId])));
 return trackingList(flightFromWorld(world),options).map(row=>({...row,anchorPartId:row.id,id:owners.get(row.id)}));
}
export function retireWorldVessel(value:SavedWorld,id:string,mode:string):{world:SavedWorld;removed:import('./vessel-recovery.js').RetiredVessel['removed']&{vesselId:string}}{
 const world=validateWorld(value),target=vessel(world,id);
 const saved=flightFromWorld(world);if(!saved)throw Error('世界に機体がありません');
 const result=retireVessel(saved,target.parts[0].id,mode);
 const next=worldFromFlight(result.record,{universalTime:world.universalTime,history:world.history});
 next.history=appendHistory(next,mode,target,{bodyId:result.removed.bodyId});if(world.activeVesselId===null)next.activeVesselId=null;
 return {world:next,removed:{...result.removed,vesselId:id}};
}

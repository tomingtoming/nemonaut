// @ts-nocheck: typing debt (BACKLOG 4d). Remove this line once tsc passes the file.
import {appendHistory} from './world-history.js';
import {validateWorld,worldFromFlight,flightFromWorld} from './world-save.js';
import {launchIntoFleet} from './launch-fleet.js';
import {saveFlight} from './flight-save.js';
import {trackingList} from './tracking.js';
import {retireVessel} from './vessel-recovery.js';
import {canControl} from './fleet.js';

function vessel(world,id){
 const found=world.vessels.find(v=>v.vesselId===id);
 if(!found)throw Error('対象の機体が世界に存在しません');
 return found;
}
// Operations own no editor state. Every result is an independent world; callers
// adopt it only after the operation succeeds, and can keep the original on error.
export function launchWorld(value,design){
 const world=validateWorld(value);
 if(design.universalTime!==undefined&&design.universalTime!==world.universalTime)throw Error('出発時刻が世界と一致しません');
 const launched=launchIntoFleet(flightFromWorld(world),{...design,universalTime:world.universalTime});
 try{const next=worldFromFlight(saveFlight(launched,{name:launched.vesselName,pilot:null}),{history:world.history});next.history=appendHistory(next,'launch',next.vessels.find(v=>v.vesselId===next.activeVesselId));return next;}
 finally{launched.dispose();}
}
export function selectWorldVessel(value,id,{observe=false}={}){
 const world=validateWorld(value),target=vessel(world,id);
 if(observe)return {world,observe:id};
 if(!canControl({parts:target.parts,crashed:target.state.crashed}))throw Error('制御装置のない機体・損傷した機体は操縦できません');
 world.activeVesselId=id;world.flightMeta={...world.flightMeta,name:target.vesselName,pilot:null};
 return {world,observe:null};
}
export function worldTrackingList(value,options){
 if(!value)return [];
 const world=validateWorld(value),owners=new Map(world.vessels.flatMap(v=>v.parts.map(p=>[p.id,v.vesselId])));
 return trackingList(flightFromWorld(world),options).map(row=>({...row,anchorPartId:row.id,id:owners.get(row.id)}));
}
export function retireWorldVessel(value,id,mode){
 const world=validateWorld(value),target=vessel(world,id);
 const result=retireVessel(flightFromWorld(world),target.parts[0].id,mode);
 const next=worldFromFlight(result.record,{universalTime:world.universalTime,history:world.history});
 next.history=appendHistory(next,mode,target,{bodyId:result.removed.bodyId});if(world.activeVesselId===null)next.activeVesselId=null;
 return {world:next,removed:{...result.removed,vesselId:id}};
}

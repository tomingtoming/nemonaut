// The scheduler owns the epoch and reads every target at the same step boundary.
// It accepts a flat fleet; neither its order nor its selected vessel owns time.
export function advanceWorldPhysics(vessels,universalTime,dt,activeVesselId,input={}){
 if(!Number.isFinite(dt)||dt<=0||!Number.isFinite(universalTime)||universalTime<0)throw Error('物理更新の時刻が不正です');
 const ids=new Set();
 for(const v of vessels){
  if(ids.has(v.vesselId)||v.universalTime!==universalTime)throw Error('世界の機体IDまたは共通時刻が不一致です');
  ids.add(v.vesselId);
 }
 if(!ids.has(activeVesselId))throw Error('操縦対象が世界に存在しません');
 const snapshots=new Map(vessels.map(v=>[v,{
  parts:v.parts,pos:v.pos.clone(),q:v.q.clone(),vel:v.vel.clone(),omega:v.omega.clone(),
  fuel:new Map(v.fuel),ballast:v.ballast,thermal:new Map([...v.thermal].map(([id,s])=>[id,{...s}]))
 }]));
 const endTime=universalTime+dt;
 for(const v of vessels)v.universalTime=endTime;
 for(const v of vessels)v.stepBody(dt,v.vesselId===activeVesselId?input:{},snapshots.get(v.navigationTarget)??null);
 return endTime;
}

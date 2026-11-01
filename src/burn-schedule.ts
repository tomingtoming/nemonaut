// All fixed maneuver nodes reserve 60 seconds for attitude and manual input.
// The dedicated transfer trial retains its existing 15-second warning.
export type BurnKind='transfer'|'departure'|'capture'|'return'|'maneuver';
export interface PlannedBurn{kind:BurnKind;label:string;time:number;margin:number}
export interface PendingBurn extends PlannedBurn{cutoff:number;overdue:boolean}
export interface BurnScheduleVessel{universalTime:number;time:number;transferGuide?:{firstBurnTime:number|null;startTime:number}|null;maneuver?:{complete?:boolean;departure?:unknown;capture?:unknown;returnPlan?:unknown;universalTime?:number|null;time:number}|null}
export function pendingBurns(v:BurnScheduleVessel):PendingBurn[]{
 const list:PlannedBurn[]=[],node=v.maneuver;
 if(v.transferGuide?.firstBurnTime===null)list.push({kind:'transfer',label:'月遷移練習',time:v.transferGuide.startTime,margin:15});
 if(node&&!node.complete){
  const kind=node.departure?'departure':node.capture?'capture':node.returnPlan?'return':'maneuver';
  list.push({kind,label:{departure:'月遷移',capture:'月捕獲',return:'母星帰還',maneuver:'マニューバ'}[kind],time:node.universalTime??v.universalTime+node.time-v.time,margin:60});
 }
 return list.map(b=>({...b,cutoff:b.time-b.margin,overdue:b.time<v.universalTime})).sort((a,b)=>a.cutoff-b.cutoff);
}

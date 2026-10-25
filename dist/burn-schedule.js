// Sort by warp cutoff, not burn time: guided burns reserve 60 seconds,
// ordinary maneuvers and transfer trials reserve 15 seconds.
export function pendingBurns(v){
 const list=[],node=v.maneuver;
 if(v.transferGuide?.firstBurnTime===null)list.push({kind:'transfer',label:'月遷移練習',time:v.transferGuide.startTime,margin:15});
 if(node&&!node.complete){
  const kind=node.departure?'departure':node.capture?'capture':node.returnPlan?'return':'maneuver';
  list.push({kind,label:{departure:'月遷移',capture:'月捕獲',return:'母星帰還',maneuver:'マニューバ'}[kind],time:node.universalTime??v.universalTime+node.time-v.time,margin:kind==='maneuver'?15:60});
 }
 return list.map(b=>({...b,cutoff:b.time-b.margin,overdue:b.time<v.universalTime})).sort((a,b)=>a.cutoff-b.cutoff);
}

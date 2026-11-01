// Shared by lunar trajectory prediction and maneuver execution.
export function terminalBurnThrottle(remaining){return remaining<2?.01:remaining<10?.1:1;}

// durationAt is cumulative full-power burn time at the delivered delta-v.
// Integrate each power segment to the chosen cutoff, including fuel mass loss.
export function terminalBurnDuration(deltaV,durationAt,tolerance=.5){
 if(!Number.isFinite(deltaV)||!Number.isFinite(tolerance)||deltaV<=tolerance||tolerance<=0)throw Error('噴射量または停止精度が不正です');
 let duration=0,delivered=0;
 for(const [remaining,power]of [[10,1],[2,.1],[tolerance,.01]]){
  const next=Math.max(0,deltaV-Math.max(remaining,tolerance));
  if(next>delivered){const end=durationAt(next),start=delivered?durationAt(delivered):0;
   if(!Number.isFinite(end)||!Number.isFinite(start)||end<start)throw Error('噴射時間を計算できません');
   duration+=(end-start)/power;delivered=next;
  }
 }
 return duration;
}

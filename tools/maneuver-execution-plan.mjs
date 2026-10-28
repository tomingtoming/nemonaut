import {transferThrottle} from '../dist/rendezvous-burn.js';
import {terminalBurnThrottle} from '../dist/maneuver-thrust-profile.js';
// Ordinary nodes name an impulse epoch. Finite-return and lunar nodes already
// name a burn start; never apply the half-duration correction to those twice.
export function maneuverExecutionPlan(node,now,fullDuration,{throttle,timing='center'}={}){
 if(!node||node.complete)throw Error('未実行のマニューバを固定してください');
 if(!Number.isFinite(now)||!Number.isFinite(node.universalTime)||!Number.isFinite(fullDuration)||fullDuration<=0)throw Error('噴射時刻または所要時間が不正です');
 const fixed=!!(node.capture||node.returnPlan||node.departure||node.rendezvous||node.plannedThrottle!==undefined);
 const planned=node.rendezvous?(node.rendezvous.burnThrottle??1):node.plannedThrottle??1,power=throttle??(fixed?planned:.1);
 if(!Number.isFinite(power)||power<=0||power>1||!['start','center'].includes(timing))throw Error('噴射設定が不正です');
 if(fixed&&power!==planned)throw Error('固定済みの計画推力を変更できません');
 const duration=fullDuration/power,startTime=node.universalTime-(!fixed&&timing==='center'?duration/2:0);
 if(duration>1200)throw Error('20分を超える噴射は未対応です');
 if(startTime<=now)throw Error('噴射開始が過去になります。計画を先へ移してください');
 return {startTime,duration,throttle:power,timing:fixed?'start':timing};
}

// Lunar return/departure predictions include this terminal throttle sequence.
// Capture and explicit finite-return nodes use their constant planned power.
export function maneuverExecutionThrottle(node,plan,remaining){
 return node.rendezvous?(node.rendezvous.burnThrottle??transferThrottle(remaining)):node.returnPlan||node.departure?terminalBurnThrottle(remaining):plan.throttle;
}

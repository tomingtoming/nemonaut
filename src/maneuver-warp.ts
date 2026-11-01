// Time warp while an automatic burn is set up. The burn needs about a minute of real-time
// attitude alignment before its start, so warp is allowed only until WARP_LEAD seconds before
// the start and never while burning; coasting at high warp is capped to the same budget.
export const WARP_LEAD=90;
export interface WarpFlight{universalTime:number}
export interface ManeuverWarpSession{owner?:WarpFlight|null;state?:string;plan?:{onAlignment?:boolean;startTime?:number}|null}
export function maneuverWarpBudget(session:ManeuverWarpSession|null|undefined,f:WarpFlight,lead=WARP_LEAD):number{
 if(!session?.owner)return Infinity;
 if(session.owner!==f||session.state==='burning'||session.plan?.onAlignment||!Number.isFinite(session.plan?.startTime))return 0;
 return Math.max(0,session.plan!.startTime!-lead-f.universalTime);
}

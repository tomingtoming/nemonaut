// The bundle is generated into dist by tools/build.mjs from tools/; those sources are not type-checked yet.
// Minimal shapes of tools/maneuver-session.mjs as src uses them.
export interface ManeuverNode{universalTime?:number;time?:number;impulse:number[];remaining:number[];complete:boolean;plannedThrottle?:number;tolerance?:number;onAlignment?:boolean;stopAtTarget?:boolean;capture?:object;returnPlan?:object;departure?:object;rendezvous?:{targetPartId?:string|null;burnThrottle?:number|null}}
export interface ManeuverExecutionPlan{startTime:number;duration:number;throttle:number;timing:string;onAlignment?:boolean}
export interface ManeuverControlState{sas:boolean;sasMode:string;navigationAuto:boolean;navigationFrame:string}
export interface ManeuverFlight extends ManeuverControlState{universalTime:number;throttle:number;maneuver?:ManeuverNode|null}
export interface ManeuverSettings{throttle?:number;timing?:string}
export class ManeuverSession{
 owner:ManeuverFlight|null;state:string;message:string;
 node?:ManeuverNode;plan?:ManeuverExecutionPlan;previous?:ManeuverControlState;lit?:boolean;
 start(f:ManeuverFlight|null|undefined,settings?:ManeuverSettings):void;
 stop(state?:string,message?:string):void;
 step(f:ManeuverFlight,dt:number):void;
}

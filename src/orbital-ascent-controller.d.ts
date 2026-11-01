// The bundle is generated into dist by tools/build.mjs from tools/; those sources are not type-checked yet.
// Minimal shapes of tools/ascent-session.mjs as src uses them.
export interface AscentSettings{altitude:number;inclination:number}
export interface AscentControlState{sas:boolean;sasMode:string;navigationAuto:boolean;navigationFrame:string}
export interface AscentFlight extends AscentControlState{throttle:number;stage:number}
export interface AscentPilot{phase:string;message:string;done:boolean;completionMessage:string}
export class AscentSession{
 owner:AscentFlight|null;pilot:AscentPilot|null;state:string;message:string;previous?:AscentControlState;elapsed?:number;
 start(f:AscentFlight,settings:AscentSettings):void;
 stop(state?:string,message?:string):void;
 step(f:AscentFlight,dt:number):void;
}

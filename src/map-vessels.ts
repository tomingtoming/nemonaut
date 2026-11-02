import {fleet} from './fleet.js';
import {centerOfVessel,relativeState,type NavigationVessel} from './relative-navigation.js';
import {bodyOrbitState,type OrbitState} from './celestial.js';
export interface MapVessel extends NavigationVessel{detached:MapVessel[];navigationTarget?:MapVessel|null;vesselId:string;vesselName?:string|null;universalTime:number;landed?:boolean;crashed?:boolean}
export interface MapVesselEntry{id:string;name:string;position:import('three').Vector3;orbit:OrbitState;stopped:boolean|undefined;target:boolean;distance:number;speed:number}
export function mapVessels(root:MapVessel):MapVesselEntry[]{return fleet(root).filter(v=>v!==root).map((v,i)=>{const position=centerOfVessel(v),relative=relativeState(root,v)!;return {id:v.vesselId,name:v.vesselName||'機体 '+(i+1),position,orbit:bodyOrbitState(position,v.vel,v.universalTime),stopped:v.landed||v.crashed,target:root.navigationTarget===v,distance:relative.distance,speed:relative.speed};});}

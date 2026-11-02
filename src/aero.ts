import * as T from 'three';
import {PARTS,type PartVector,type PartDefinition} from './catalog.js';
import {fuelMass,type FuelMap} from './resources.js';
/** Minimal part shape for pose helpers: catalogue type plus local position and Euler rotation. */
export interface AeroPart{type:string;p:PartVector;r:PartVector}
export interface MassPart extends Pick<AeroPart,'type'>{id:string;fuelLoad?:number}
export type ControlAxisName='pitch'|'yaw'|'roll';
export type ControlAxes=Record<ControlAxisName,boolean>;
export type ControlCommands=Partial<Record<ControlAxisName,number>>;
export interface ControlPart extends AeroPart{controlEnabled?:boolean;controlPitch?:boolean;controlYaw?:boolean;controlRoll?:boolean;controlLimit?:number}
export interface AeroAnalysis{center:T.Vector3;area:number;chord:number;weight:number;staticMargin:number|null}
export interface SurfaceForce{force:T.Vector3;alpha:number;cl:number;stalled:boolean}
export const partRotation=(p:Pick<AeroPart,'r'>):T.Quaternion=>new T.Quaternion().setFromEuler(new T.Euler(...p.r));
export function partMass(p:MassPart,fuel:FuelMap|number=1,ballast=0,thermal:ReadonlyMap<string,{ablator?:number}>|null=null):number{const d=PARTS[p.type];return d.mass+fuelMass(p,fuel)+(d.ballast||0)*ballast+(thermal?.get(p.id)?.ablator??d.ablator??0);}
export function partCenter(p:AeroPart):T.Vector3{return new T.Vector3(...(PARTS[p.type].massCenter||[0,0,0])).applyQuaternion(partRotation(p)).add(new T.Vector3(...p.p));}
export function aeroPoint(p:AeroPart):T.Vector3{return new T.Vector3(...(PARTS[p.type].ac||[0,0,0])).applyQuaternion(partRotation(p)).add(new T.Vector3(...p.p));}
export function aeroAnalysis(parts:readonly AeroPart[],com:T.Vector3):AeroAnalysis{const center=new T.Vector3();let weight=0,chord=0,area=0;for(const p of parts){const d=PARTS[p.type];if(!d.wing)continue;const normal=new T.Vector3(0,0,1).applyQuaternion(partRotation(p)),w=d.wing*normal.y**2;center.addScaledVector(aeroPoint(p),w);weight+=w;chord+=w*(d.chord||1);area+=d.wing;}center.divideScalar(weight||1);chord/=weight||1;return {center,area,chord,weight,staticMargin:weight?(com.z-center.z)/(chord||1):null};}
export function surfaceForce(p:Pick<AeroPart,'type'>,orientation:T.Quaternion,velocity:T.Vector3,density:number,deflection=0):SurfaceForce{
 const d=PARTS[p.type] as PartDefinition&{wing:number},normal=new T.Vector3(0,0,1),forward=new T.Vector3(0,1,0),span=new T.Vector3(1,0,0);
 const hinge=new T.Quaternion().setFromAxisAngle(span,deflection);normal.applyQuaternion(hinge).applyQuaternion(orientation);forward.applyQuaternion(hinge).applyQuaternion(orientation);span.applyQuaternion(orientation);
 const flow=velocity.clone().addScaledVector(span,-velocity.dot(span)),speed=flow.length();if(speed<.05)return {force:new T.Vector3(),alpha:0,cl:0,stalled:false};
 const alpha=Math.atan2(-flow.dot(normal),flow.dot(forward)),a=Math.abs(alpha),stall=15*Math.PI/180;
 const cl=a<=stall?4.5*alpha:Math.sign(alpha)*1.18*Math.cos(Math.min(Math.PI/2,(a-stall)*1.4));
 const cd=.022+.065*cl*cl+1.2*Math.sin(alpha)**2;const direction=flow.clone().normalize();
 const lift=normal.clone().addScaledVector(direction,-normal.dot(direction)).normalize();
 const q=.5*density*speed*speed*d.wing;
 return {force:lift.multiplyScalar(q*cl).addScaledVector(direction,-q*cd),alpha,cl,stalled:a>stall};
}
export function controlAxes(p:ControlPart):ControlAxes{const axis=PARTS[p.type].controlAxis;return Object.fromEntries((['pitch','yaw','roll'] as ControlAxisName[]).map(name=>[name,p[('control'+name[0].toUpperCase()+name.slice(1)) as 'controlPitch'|'controlYaw'|'controlRoll']??(axis==='auto'||axis===name)])) as ControlAxes;}
export function controlDeflection(p:ControlPart,com:T.Vector3,commands:ControlCommands):number{
 const d=PARTS[p.type];if(!d.controlAxis||p.controlEnabled===false)return 0;
 const n=new T.Vector3(0,0,1).applyQuaternion(partRotation(p)),moment=aeroPoint(p).sub(com).cross(n),axes=controlAxes(p);
 // Normalize only the enabled moment components. Single-axis defaults retain
 // their original full travel; mixed axes share the same bounded travel.
 const leverage=moment.length();moment.set(axes.pitch?moment.x:0,axes.yaw?moment.y:0,axes.roll?moment.z:0);
 if(moment.length()<Math.max(1e-9,leverage*1e-8))return 0;moment.normalize();
 const intent=new T.Vector3(commands.pitch||0,commands.yaw||0,commands.roll||0);
 return T.MathUtils.clamp(moment.dot(intent),-1,1)*(d.maxDeflection||(d.controlAxis==='auto'?18:25))*(p.controlLimit??1)*Math.PI/180;
}

import {PARTS} from './catalog.js';
import {partCenter,type AeroPart} from './aero.js';
import {referenceBody} from './celestial.js';
import {surfaceRelativeVelocity,surfaceAngularVelocity} from './surface-frame.js';
/** The vessel fields isParked reads (a Flight satisfies it). */
export interface ParkedVessel{pos:import('three').Vector3;q:import('three').Quaternion;vel:import('three').Vector3;omega:import('three').Vector3;universalTime:number;time:number;landed?:boolean;landedTime:number;brake?:boolean;telemetry:{contacts:number};stats:{com:import('three').Vector3};parts:readonly AeroPart[];environment?:string}
const center=(v:ParkedVessel):import('three').Vector3=>v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q));
export function isParked(v:ParkedVessel):boolean|undefined{
 const body=referenceBody(v.pos,v.universalTime);
 const contact=(v.landed&&v.landedTime>.5)||(v.brake&&v.time>.5&&v.telemetry.contacts>0);
 const speed=surfaceRelativeVelocity(center(v),v.vel,v.universalTime,body).length(),spin=v.omega.clone().sub(surfaceAngularVelocity(body)).length();
 // Bound solver jitter at the outermost material point, not just COM. A long
 // vehicle must not qualify while its extremities sweep across the surface.
 const radius=v.parts.reduce((r,p)=>Math.max(r,partCenter(p).distanceTo(v.stats.com)+Math.hypot(...PARTS[p.type].size)/2),0);
 return contact&&v.environment!=='water'&&speed<.1&&spin<.02&&speed+spin*radius<.2;
}

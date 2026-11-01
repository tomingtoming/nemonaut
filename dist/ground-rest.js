// @ts-nocheck: typing debt (BACKLOG 4d). Remove this line once tsc passes the file.
import {PARTS} from './catalog.js';
import {partCenter} from './aero.js';
import {referenceBody} from './celestial.js';
import {surfaceRelativeVelocity,surfaceAngularVelocity} from './surface-frame.js';
const center=v=>v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q));
export function isParked(v){
 const body=referenceBody(v.pos,v.universalTime);
 const contact=(v.landed&&v.landedTime>.5)||(v.brake&&v.time>.5&&v.telemetry.contacts>0);
 const speed=surfaceRelativeVelocity(center(v),v.vel,v.universalTime,body).length(),spin=v.omega.clone().sub(surfaceAngularVelocity(body)).length();
 // Bound solver jitter at the outermost material point, not just COM. A long
 // vehicle must not qualify while its extremities sweep across the surface.
 const radius=v.parts.reduce((r,p)=>Math.max(r,partCenter(p).distanceTo(v.stats.com)+Math.hypot(...PARTS[p.type].size)/2),0);
 return contact&&v.environment!=='water'&&speed<.1&&spin<.02&&speed+spin*radius<.2;
}

import {partCenter} from './aero.js';
import {referenceBody,bodyAltitude} from './celestial.js';
import {atmosphere} from './planet.js';
// Match the reference body and vessel altitude used by the flight solver.
export function engineMedium(f,p,time=f.universalTime){
 const body=referenceBody(f.pos,time),height=bodyAltitude(f.pos,time,body);
 const point=partCenter(p).applyQuaternion(f.q).add(f.pos);
 return {density:body.id==='planet'?atmosphere(height).density:0,
 submersion:f.environment==='water'&&body.id==='planet'?Math.max(0,Math.min(1,(.1-bodyAltitude(point,time,body))/.25)):0};
}

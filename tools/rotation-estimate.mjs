// Diagnostic quasi-static nose-up moment about the rearmost wheel contact.
// Flat runway, zero pitch/rate, full elevator. Not a takeoff guarantee.
import * as T from 'three';
import {PARTS} from '../dist/catalog.js';
import {partCenter,partRotation,aeroPoint,surfaceForce,controlDeflection} from '../dist/aero.js';
import {bodyDrag} from '../dist/body-drag.js';
import {bodyUp} from '../dist/celestial.js';
import {surfaceRelativeVelocity} from '../dist/surface-frame.js';
export function rotationEstimate(f,{density=1.225,gravity=9.81,current=false}={}){
 const wheels=f.parts.filter(p=>PARTS[p.type].wheel);if(!wheels.length)return null;
 const rear=wheels.reduce((a,b)=>partCenter(a).z<partCenter(b).z?a:b),pivot=partCenter(rear);pivot.y-=PARTS[rear.type].size[1]/2;pivot.x=0;
 const about=(point,force)=>point.clone().sub(pivot).cross(force).x;
 const center=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),inverse=f.q.clone().invert();
 const weight=current?bodyUp(center,f.universalTime).applyQuaternion(inverse).multiplyScalar(-f.stats.mass*gravity):new T.Vector3(0,-f.stats.mass*gravity,0);
 const wind=current?surfaceRelativeVelocity(center,f.vel,f.universalTime).applyQuaternion(inverse).normalize():new T.Vector3(0,0,1);
 let fixedMoment=about(f.stats.com,weight),aeroMoment=0;
 for(const p of f.parts){
  const d=PARTS[p.type],q=partRotation(p);
  if(d.thrust&&f.active.has(p.id))fixedMoment+=about(partCenter(p),new T.Vector3(0,1,0).applyQuaternion(q).multiplyScalar(f.engineThrust.get(p.id)||0));
  if(d.wing){const force=surfaceForce(p,q,wind,density,controlDeflection(p,f.stats.com,{pitch:-1})).force;aeroMoment+=about(aeroPoint(p),force);}
 }
 aeroMoment+=about(f.stats.com,bodyDrag(f.bodyAerodynamics,new T.Quaternion(),wind,density).force);
 const speed=fixedMoment<=0?0:aeroMoment<0?Math.sqrt(-fixedMoment/aeroMoment):Infinity;
 return {speed,fixedMoment,aeroMoment,pivot:pivot.toArray()};
}

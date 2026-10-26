import * as T from 'three';
import {PARTS} from './catalog.js';
import {partCenter,partMass} from './aero.js';

// Same displaced volume as the two buoyancy samples in Flight. This is the
// fully submerged center, not the changing center of a partly immersed hull.
export function displacedVolume(p){const d=PARTS[p.type];return d.volume||d.size[0]*d.size[1]*d.size[2]*.18;}
export function buoyancyBalance(parts,ballast=0){
 const center=new T.Vector3(),com=new T.Vector3();let volume=0,mass=0;
 for(const p of parts){const v=displacedVolume(p),m=partMass(p,1,ballast),point=partCenter(p);volume+=v;mass+=m;center.addScaledVector(point,v);com.addScaledVector(point,m);}
 center.divideScalar(volume||1);com.divideScalar(mass||1);
 return {center,com,volume,mass,displacement:volume*1000};
}

import * as T from 'three';
import {Flight} from '../../dist/core.js';
import {part} from '../../dist/catalog.js';
import {saveFlight} from '../../dist/flight-save.js';
import {bodyUp} from '../../dist/celestial.js';
// Golden v2: impacts where the failed part is decided by per-part contact impulse,
// not by the clearance tie-break. Zeroing impulses picks the other part (sprint 303).
export function scenarios(){
 const result=[];
 const drop=(name,a,b,offset,height,speed,rx,rz,fuelLoad)=>{
  const root=part(a,[0,0,0]),other=part(b,offset,[0,0,0],root.id);if(fuelLoad!==undefined)other.fuelLoad=fuelLoad;
  const f=new Flight([root,other],'land');f.pos.y+=height;f.vel.addScaledVector(bodyUp(f.pos,0),-speed);f.q.multiply(new T.Quaternion().setFromEuler(new T.Euler(rx,0,rz)));
  result.push({name,dt:1/120,ticks:240,mode:'impact',initial:saveFlight(f),actions:[{tick:120,kind:'restore'}],checkpoints:[0,60,120,240]});f.dispose();
 };
 drop('capsule-tank-impulse-ranking','capsule','tank',[1.5,0,0],1.6,32,-.2,.25,1);
 drop('probe-battery-impulse-ranking','probe','battery',[2.2,0,0],3.1,22,-.19,.17);
 return result;
}

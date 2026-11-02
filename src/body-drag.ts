import {cargoShellBoxes,type CargoBox,type CargoBayDefinition} from './cargo-geometry.js';
import * as T from 'three';
import {PARTS,type PartDefinition} from './catalog.js';
import {partRotation,type AeroPart} from './aero.js';
// D = 1/2 rho v² Cd A. Bounding-box face quadrature approximates exposed
// projected area; this is a game model, not measured Cd or compressible CFD.
// Wings already have their own lift/drag and are excluded here.
type Axis='x'|'y'|'z';
const axes:readonly Axis[]=['x','y','z'];
export const MIN_BODY_DRAG_FORCE=1e-4; // Newtons; upper bound, not a speed cutoff.
export interface BodyDragPart extends AeroPart{id:string;cargoOpen?:boolean}
export interface BodyDragBox{id:string;type:string;center:T.Vector3;half:T.Vector3;rotation:T.Quaternion;inverse:T.Quaternion;axes:T.Vector3[];wind?:number[]}
export interface BodyAerodynamics{maxCdArea:number;dragArea(direction:T.Vector3):number}
export interface BodyDragResult{force:T.Vector3;cdArea:number}
function hitBox(point:T.Vector3,direction:T.Vector3,box:BodyDragBox):number|null{
 const x=point.x-box.center.x,y=point.y-box.center.y,z=point.z-box.center.z;
 let near=-Infinity,far=Infinity;
 for(let i=0;i<3;i++){const axis=box.axes[i],o=x*axis.x+y*axis.y+z*axis.z,d=box.wind![i],h=box.half[axes[i]];if(Math.abs(d)<1e-10){if(Math.abs(o)>h+1e-8)return null;}else{const a=(-h-o)/d,b=(h-o)/d;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}}
 return far>=Math.max(near,0)?Math.max(near,0):null;
}
export function createBodyAerodynamics(parts:BodyDragPart[]):BodyAerodynamics{
 const boxes=parts.filter(p=>!PARTS[p.type].wing).flatMap((p):BodyDragBox[]=>{const d=PARTS[p.type],rotation=partRotation(p),pieces:CargoBox[]=d.cargoBay?cargoShellBoxes(d as PartDefinition&CargoBayDefinition,p.cargoOpen):[{center:[0,0,0],size:d.size}];return pieces.map(piece=>{const q=rotation.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(...(piece.rotation||[0,0,0]))));return {id:p.id,type:p.type,center:new T.Vector3(...piece.center).applyQuaternion(rotation).add(new T.Vector3(...p.p)),half:new T.Vector3(...piece.size).multiplyScalar(.5),rotation:q,inverse:q.clone().invert(),axes:[new T.Vector3(1,0,0),new T.Vector3(0,1,0),new T.Vector3(0,0,1)].map(a=>a.applyQuaternion(q))};});});
 let lastDirection:T.Vector3|null=null,lastArea=0;
 const maxCdArea=boxes.reduce((sum,b)=>sum+4*(b.half.x*b.half.y+b.half.y*b.half.z+b.half.z*b.half.x)*(b.type==='heatShield'?1.1:.4),0);
 return {maxCdArea,dragArea(direction){
  if(direction.lengthSq()<1e-12)return 0;const wind=direction.clone().normalize();
  if(lastDirection&&lastDirection.distanceToSquared(wind)<1e-6)return lastArea;
  for(const box of boxes)box.wind=box.axes.map(a=>a.dot(wind));
  let cdArea=0;
  for(const box of boxes){const local=wind.clone().applyQuaternion(box.inverse);
   for(let axis=0;axis<3;axis++){
    const key=axes[axis],cos=Math.abs(local[key]);if(cos<1e-6)continue;
    const u=axes[(axis+1)%3],v=axes[(axis+2)%3],sign=Math.sign(local[key]);let exposed=0;
    for(let i=0;i<4;i++)for(let j=0;j<4;j++){
     const p=new T.Vector3();p[key]=sign*box.half[key];p[u]=box.half[u]*((i+.5)/2-1);p[v]=box.half[v]*((j+.5)/2-1);p.applyQuaternion(box.rotation).add(box.center);
     const start=p.clone().addScaledVector(wind,1e-7);
     if(!boxes.some(other=>other!==box&&hitBox(start,wind,other)!==null))exposed++;
    }
    // Shield disc uses its circular face area. Other dimensions are box bounds.
    const round=box.type==='heatShield'&&axis===1?Math.PI/4:1;
    const cd=box.type==='heatShield'&&axis===1?1.1:PARTS[box.type].streamlinedNose&&axis===1&&sign>0?.15:.4;
    cdArea+=4*box.half[u]*box.half[v]*cos*exposed/16*round*cd;
   }
  }
  lastDirection=wind;lastArea=cdArea;return cdArea;
 }};
}
export function bodyDrag(model:BodyAerodynamics,orientation:T.Quaternion,velocity:T.Vector3,density:number):BodyDragResult{
 const speed=velocity.length();if(speed<1e-8||density<=0)return {force:new T.Vector3(),cdArea:0};
 // Near rest the wind direction is numerical noise, invalidating the directional
 // cache every step. Skip quadrature only when even fully exposed drag is tiny.
 if(.5*density*speed*speed*model.maxCdArea<MIN_BODY_DRAG_FORCE)return {force:new T.Vector3(),cdArea:0};
 const local=velocity.clone().applyQuaternion(orientation.clone().invert()),cdArea=model.dragArea(local);
 return {force:velocity.clone().multiplyScalar(-.5*density*speed*cdArea),cdArea};
}

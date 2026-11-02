import * as T from 'three';
import {PARTS,type Part,type PartCatalog} from './catalog.js';
export interface OrientedBounds{center:T.Vector3;half:T.Vector3;axes:T.Vector3[];quaternion:T.Quaternion;aabb:T.Box3}
export interface InterferencePair{a:string;b:string;depth:number}
export interface AssemblyInterferences{total:number;pairs:InterferencePair[]}
import {cargoShellBoxes} from './cargo-geometry.js';

export function partInterferenceBounds(p:Part,bounds:ReadonlyMap<string,T.Box3>):OrientedBounds[]{
 const d=(PARTS as PartCatalog)[p.type];if(!d?.cargoBay)return [orientedBounds(p,bounds.get(p.type))];
 const q=new T.Quaternion().setFromEuler(new T.Euler(...p.r));
 return cargoShellBoxes(d as import('./cargo-geometry.js').CargoBayDefinition,p.cargoOpen).map(b=>{
  const center=new T.Vector3(...b.center).applyQuaternion(q).add(new T.Vector3(...p.p)),rotation=new T.Euler().setFromQuaternion(q.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(...(b.rotation||[0,0,0]))))),half=new T.Vector3(...b.size).multiplyScalar(.5);
  return orientedBounds({...p,p:center.toArray(),r:[rotation.x,rotation.y,rotation.z]},new T.Box3(half.clone().negate(),half));
 });
}

// Local bounds come from the loaded Blender asset, before any animation or mounts.
export function orientedBounds(part:Pick<Part,'p'|'r'>,bounds:T.Box3|null|undefined):OrientedBounds{
 if(!bounds||bounds.isEmpty())throw Error('部品のモデル範囲がありません');
 const q=new T.Quaternion().setFromEuler(new T.Euler(...part.r));
 const center=bounds.getCenter(new T.Vector3()).applyQuaternion(q).add(new T.Vector3(...part.p));
 const half=bounds.getSize(new T.Vector3()).multiplyScalar(.5);
 const axes=[new T.Vector3(1,0,0),new T.Vector3(0,1,0),new T.Vector3(0,0,1)].map(v=>v.applyQuaternion(q));
 const extents=new T.Vector3();for(let i=0;i<3;i++){const h=half.getComponent(i),axis=axes[i];extents.x+=Math.abs(axis.x)*h;extents.y+=Math.abs(axis.y)*h;extents.z+=Math.abs(axis.z)*h;}
 return {center,half,axes,quaternion:q,aabb:new T.Box3(center.clone().sub(extents),center.clone().add(extents))};
}
export function overlapDepth(a:OrientedBounds,b:OrientedBounds,tolerance=.002):number{
 if(!a.aabb.intersectsBox(b.aabb))return 0;
 const delta=b.center.clone().sub(a.center),axes=[...a.axes,...b.axes];
 for(const x of a.axes)for(const y of b.axes){const cross=new T.Vector3().crossVectors(x,y);if(cross.lengthSq()>1e-12)axes.push(cross.normalize());}
 let depth=Infinity;
 for(const axis of axes){let reach=0;for(let i=0;i<3;i++)reach+=Math.abs(axis.dot(a.axes[i]))*a.half.getComponent(i)+Math.abs(axis.dot(b.axes[i]))*b.half.getComponent(i);const penetration=reach-Math.abs(delta.dot(axis));if(penetration<=tolerance)return 0;depth=Math.min(depth,penetration);}
 return depth;
}
export function assemblyInterferences(parts:readonly Part[],bounds:ReadonlyMap<string,T.Box3>,{tolerance=.002,limit=60}:{tolerance?:number;limit?:number}={}):AssemblyInterferences{
 const boxes=parts.map(p=>{const shapes=partInterferenceBounds(p,bounds),aabb=new T.Box3();for(const s of shapes)aabb.union(s.aabb);return {id:p.id,shapes,aabb};}).sort((a,b)=>a.aabb.min.x-b.aabb.min.x),pairs:InterferencePair[]=[];let total=0;
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const a=boxes[i],b=boxes[j];if(b.aabb.min.x>=a.aabb.max.x-tolerance)break;
  let depth=0;for(const x of a.shapes)for(const y of b.shapes)depth=Math.max(depth,overlapDepth(x,y,tolerance));if(!depth)continue;total++;if(pairs.length<limit)pairs.push({a:a.id,b:b.id,depth});
 }
 return {total,pairs};
}

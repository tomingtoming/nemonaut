import * as T from 'three';

// Local bounds come from the loaded Blender asset, before any animation or mounts.
export function orientedBounds(part,bounds){
 if(!bounds||bounds.isEmpty())throw Error('部品のモデル範囲がありません');
 const q=new T.Quaternion().setFromEuler(new T.Euler(...part.r));
 const center=bounds.getCenter(new T.Vector3()).applyQuaternion(q).add(new T.Vector3(...part.p));
 const half=bounds.getSize(new T.Vector3()).multiplyScalar(.5);
 const axes=[new T.Vector3(1,0,0),new T.Vector3(0,1,0),new T.Vector3(0,0,1)].map(v=>v.applyQuaternion(q));
 const extents=new T.Vector3();for(let i=0;i<3;i++){const h=half.getComponent(i),axis=axes[i];extents.x+=Math.abs(axis.x)*h;extents.y+=Math.abs(axis.y)*h;extents.z+=Math.abs(axis.z)*h;}
 return {center,half,axes,quaternion:q,aabb:new T.Box3(center.clone().sub(extents),center.clone().add(extents))};
}
export function overlapDepth(a,b,tolerance=.002){
 if(!a.aabb.intersectsBox(b.aabb))return 0;
 const delta=b.center.clone().sub(a.center),axes=[...a.axes,...b.axes];
 for(const x of a.axes)for(const y of b.axes){const cross=new T.Vector3().crossVectors(x,y);if(cross.lengthSq()>1e-12)axes.push(cross.normalize());}
 let depth=Infinity;
 for(const axis of axes){let reach=0;for(let i=0;i<3;i++)reach+=Math.abs(axis.dot(a.axes[i]))*a.half.getComponent(i)+Math.abs(axis.dot(b.axes[i]))*b.half.getComponent(i);const penetration=reach-Math.abs(delta.dot(axis));if(penetration<=tolerance)return 0;depth=Math.min(depth,penetration);}
 return depth;
}
export function assemblyInterferences(parts,bounds,{tolerance=.002,limit=60}={}){
 const boxes=parts.map(p=>({id:p.id,box:orientedBounds(p,bounds.get(p.type))})).sort((a,b)=>a.box.aabb.min.x-b.box.aabb.min.x),pairs=[];let total=0;
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const a=boxes[i],b=boxes[j];if(b.box.aabb.min.x>=a.box.aabb.max.x-tolerance)break;
  const depth=overlapDepth(a.box,b.box,tolerance);if(!depth)continue;total++;if(pairs.length<limit)pairs.push({a:a.id,b:b.id,depth});
 }
 return {total,pairs};
}

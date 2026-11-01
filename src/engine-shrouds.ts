import * as T from 'three';
import {PARTS} from './catalog.js';

// Covers are derived from actual axial connections, never saved as extra parts.
// Looking at both ends of an edge also supports a craft built from the bottom up.
export function engineShrouds(parts){
 const byId=new Map<any,any>(parts.map(p=>[p.id,p])),adjacent=new Map<any,any>(parts.map(p=>[p.id,[]]));
 for(const p of parts)if(byId.has(p.parent)){adjacent.get(p.id).push(byId.get(p.parent));adjacent.get(p.parent).push(p);}
 const result=[];
 for(const p of parts){
  const d=PARTS[p.type];if(!d.thrust||d.air||d.water)continue;
  const q=new T.Quaternion().setFromEuler(new T.Euler(...p.r)),down=new T.Vector3(0,-1,0).applyQuaternion(q);
  const bottom=new T.Vector3(...p.p).addScaledVector(down,d.size[1]/2);
  for(const support of adjacent.get(p.id)){
   const s=PARTS[support.type];if(!(s.decoupler||s.fuel||support.type.startsWith('adapter')))continue;
   const sq=new T.Quaternion().setFromEuler(new T.Euler(...support.r));
   const matched=[1,-1].some(sign=>{
    const normal=new T.Vector3(0,sign,0).applyQuaternion(sq);
    const point=new T.Vector3(...support.p).addScaledVector(normal,s.size[1]/2);
    return normal.dot(down)<-.999&&point.distanceTo(bottom)<.065;
   });
   if(matched){result.push({engineId:p.id,supportId:support.id,diameter:d.size[0],height:d.size[1]});break;}
  }
 }
 return result;
}

export function syncEngineShrouds(parts,objects,source){
 if(!source)return;
 const specs=new Map<any,any>(engineShrouds(parts).map(s=>[s.engineId,s]));
 for(const [id,object]of objects){
  const spec=specs.get(id);let cover=object.userData.engineShroud;
  if(spec&&!cover){
   cover=source.clone(true);cover.name='Automatic engine shroud';
   cover.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.userData.sharedAsset=true;}});
   object.add(cover);object.userData.engineShroud=cover;
  }
  if(cover){cover.visible=!!spec;if(spec){cover.scale.set(spec.diameter,spec.height,spec.diameter);cover.userData.supportId=spec.supportId;}}
 }
}

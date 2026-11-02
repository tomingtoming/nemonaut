import * as T from 'three';
import {PARTS,type Part} from './catalog.js';
export interface EngineShroudSpec{engineId:string;supportId:string;diameter:number;height:number}

// Covers are derived from actual axial connections, never saved as extra parts.
// Looking at both ends of an edge also supports a craft built from the bottom up.
export function engineShrouds(parts:readonly Part[]):EngineShroudSpec[]{
 const byId=new Map<string|null,Part>(parts.map(p=>[p.id,p])),adjacent=new Map<string|null,Part[]>(parts.map(p=>[p.id,[]]));
 const linksOf=(id:string|null):Part[]=>{const links=adjacent.get(id);if(!links)throw Error('部品の接続一覧が見つかりません');return links;};
 for(const p of parts){const parent=byId.get(p.parent);if(parent){linksOf(p.id).push(parent);linksOf(p.parent).push(p);}}
 const result:EngineShroudSpec[]=[];
 for(const p of parts){
  const d=PARTS[p.type];if(!d.thrust||d.air||d.water)continue;
  const q=new T.Quaternion().setFromEuler(new T.Euler(...p.r)),down=new T.Vector3(0,-1,0).applyQuaternion(q);
  const bottom=new T.Vector3(...p.p).addScaledVector(down,d.size[1]/2);
  for(const support of linksOf(p.id)){
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

export function syncEngineShrouds(parts:readonly Part[],objects:ReadonlyMap<string,T.Object3D>,source:T.Object3D|null|undefined):void{
 if(!source)return;
 const specs=new Map<string,EngineShroudSpec>(engineShrouds(parts).map(s=>[s.engineId,s]));
 for(const [id,object]of objects){
  const spec=specs.get(id);let cover:T.Object3D|undefined=object.userData.engineShroud;
  if(spec&&!cover){
   cover=source.clone(true);cover.name='Automatic engine shroud';
   cover.traverse(o=>{if('isMesh' in o&&o.isMesh){o.castShadow=true;o.receiveShadow=true;o.userData.sharedAsset=true;}});
   object.add(cover);object.userData.engineShroud=cover;
  }
  if(cover){cover.visible=!!spec;if(spec){cover.scale.set(spec.diameter,spec.height,spec.diameter);cover.userData.supportId=spec.supportId;}}
 }
}

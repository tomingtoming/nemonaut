import * as T from 'three';
import {fuelNetworks} from './resources.js';
import {partCenter} from './aero.js';
// Own only diagnostic geometry; never change Blender asset materials.
export function createFuelOverlay(scene){
 const group=new T.Group();scene.add(group);
 function clear(){for(const item of [...group.children] as any[]){item.geometry.dispose();item.material.dispose();group.remove(item);}}
 function show(parts,id,objects){
  clear();const network=fuelNetworks(parts).network.get(id);if(!network)return;
  const ids=new Set(network.parts.map(p=>p.id)),tanks=new Set(network.tanks.map(p=>p.id)),engines=new Set(network.engines.map(p=>p.id));
  const centers=new Map(parts.map(p=>[p.id,partCenter(p)])),segments=[];
  for(const p of network.parts){
   if(p.parent&&ids.has(p.parent))segments.push(centers.get(p.id),centers.get(p.parent));
   if(!tanks.has(p.id)&&!engines.has(p.id)&&p.id!==id)continue;
   const object=objects.get(p.id);if(!object)continue;object.updateWorldMatrix(true,true);
   const box=new T.BoxHelper(object,tanks.has(p.id)?0x55dce8:engines.has(p.id)?0xff9c56:0xb7d783);
   box.material.depthTest=false;box.renderOrder=25;box.userData.fuelPartId=p.id;group.add(box);
  }
  if(segments.length){const lines=new T.LineSegments(new T.BufferGeometry().setFromPoints(segments),new T.LineBasicMaterial({color:0xb7d783,depthTest:false}));lines.renderOrder=24;group.add(lines);}
 }
 return {group,show,clear};
}

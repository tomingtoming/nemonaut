import * as T from 'three';
import {DELIVERY_SITES,deliverySitePosition} from './delivery-sites.js';
import {center} from './planet.js';
// Parent is the co-rotating planet-fixed facilities group. Flush visual marks
// add no collision shape and do not alter the installation eligibility radius.
export function addSurveyMarkers(parent:T.Object3D,assets:ReadonlyMap<string,T.Object3D>):T.Object3D[]{
 const markers:T.Object3D[]=[];
 for(const site of DELIVERY_SITES){
  const source=assets.get('survey-'+site.id.split('-')[0]);if(!source)continue;
  const marker=source.clone(true),radial=deliverySitePosition(0,site).sub(center);
  marker.name=site.name;marker.userData.siteId=site.id;marker.position.copy(radial);marker.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),radial.clone().normalize());
  marker.traverse((mesh:T.Object3D&{isMesh?:boolean})=>{if(mesh.isMesh){mesh.userData.sharedAsset=true;mesh.receiveShadow=true;mesh.castShadow=false;}});
  parent.add(marker);markers.push(marker);
 }return markers;
}

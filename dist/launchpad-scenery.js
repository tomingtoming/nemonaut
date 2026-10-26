import * as T from 'three';
import {PLANET} from './planet.js';
// Facilities are children of the co-rotating, planet-centred group.
// This visual asset keeps the existing departure floor and physics unchanged.
export function addLaunchpad(parent,source){
 if(!source)return null;
 const pad=source.clone(true);pad.name='Launch complex 01';pad.position.set(0,PLANET.radius,0);
 pad.traverse(o=>{if(o.isMesh){o.userData.sharedAsset=true;o.castShadow=true;o.receiveShadow=true;}});
 for(const [x,z]of [[-30,26],[30,26],[30,-26]]){
  const light=new T.PointLight('#ffe2a7',1100,85,2);light.position.set(x,10,z);pad.add(light);
 }
 parent.add(pad);return pad;
}

import {mapPointEpoch} from './maneuver.js';
export function relativeOrbitPlane(o,target){
 if(!target||o.bodyId!==target.bodyId||o.normal.lengthSq()<.5||target.normal.lengthSq()<.5||o.p<1)return null;
 const dot=Math.max(-1,Math.min(1,o.normal.dot(target.normal))),inclination=Math.acos(dot)*180/Math.PI,line=o.normal.clone().cross(target.normal);
 if(line.lengthSq()<1e-10)return {inclination,nodes:[]};
 line.normalize();const x=o.eccentricity>1e-7?o.evec.clone().normalize():o.r.clone().normalize(),y=o.normal.clone().cross(x),nodes=[];
 for(const sign of [1,-1]){const direction=line.clone().multiplyScalar(sign),cos=direction.dot(x),sin=direction.dot(y),den=1+o.eccentricity*cos,r=o.p/den;if(den<=0||r<o.body.radius||r>(o.body.sphereOfInfluence??Infinity))continue;
  const velocity=x.clone().multiplyScalar(-sin).addScaledVector(y,o.eccentricity+cos),position=direction.multiplyScalar(r).add(o.center);let epoch=null;try{epoch=mapPointEpoch(o,position);}catch{}
  nodes.push({label:velocity.dot(target.normal)>0?'AN':'DN',position,epoch});
 }
 return {inclination,nodes};
}

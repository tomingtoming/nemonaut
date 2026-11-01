import * as T from 'three';
import {bodyUp,relativeMotion,MOON} from './celestial.js';
import {attitudeTarget} from './navigation.js';

// Commands only a SAS target. The installed actuators must rotate the craft.
export function setAscentAttitude(f,pitch){
 if(!Number.isFinite(pitch)||pitch<0||pitch>90||f.crashed||!f.rocketAxes)throw Error('離陸姿勢を指定できません');
 const pos=f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)),up=bodyUp(pos,f.universalTime);
 const horizontal=relativeMotion(pos,f.vel,f.universalTime).velocity;
 horizontal.addScaledVector(up,-horizontal.dot(up));
 if(horizontal.length()<1){horizontal.set(0,0,1).addScaledVector(up,-up.z);if(horizontal.lengthSq()<1e-8)horizontal.set(1,0,0).addScaledVector(up,-up.x);}
 horizontal.normalize();const radians=pitch*Math.PI/180,target=horizontal.multiplyScalar(Math.cos(radians)).addScaledVector(up,Math.sin(radians));
 f.sas=true;f.sasMode='hold';f.holdQ=attitudeTarget(f.q,new T.Vector3(0,1,0),target);
 return target;
}

export function lunarOrbitReached(orbit){return !!orbit&&orbit.bodyId==='moon'&&orbit.energy<0&&orbit.periapsis>1000&&orbit.apoapsis+MOON.radius<MOON.sphereOfInfluence;}

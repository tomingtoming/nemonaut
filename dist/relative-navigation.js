import * as T from 'three';
import {partCenter,partMass} from './aero.js';
import {PARTS} from './catalog.js';
import {fleet} from './fleet.js';
export const TARGET_MODES=['target','relativeRetrograde','dock'];
export function centerOfVessel(v){const center=new T.Vector3();let mass=0;for(const p of v.parts){const m=partMass(p,v.fuel,v.ballast,v.thermal);mass+=m;center.addScaledVector(partCenter(p),m);}return center.divideScalar(mass||1).applyQuaternion(v.q).add(v.pos);}
export function relativeState(v,target){
 if(!target||v===target)return null;
 const offset=centerOfVessel(target).sub(centerOfVessel(v)),velocity=target.vel.clone().sub(v.vel),distance=offset.length(),speed=velocity.length(),direction=distance>1e-6?offset.clone().divideScalar(distance):null;
 return {distance,speed,closing:direction?-velocity.dot(direction):0,direction,braking:speed>.01?velocity.clone().divideScalar(speed):null,offset,velocity};
}
export function setTarget(root,v,target){const vessels=fleet(root);if(!vessels.includes(v)||target===v||(target&&!vessels.includes(target)))throw Error('目標は同じ飛行に属する他の機体を選んでください');if(v.navigationTarget!==target){v.dockingPorts=null;v.portTranslationEnabled=false;}v.targetPartId=target?(target.parts.find(p=>PARTS[p.type].control)||target.parts[0]).id:null;v.navigationTarget=target||null;if(!target&&TARGET_MODES.includes(v.sasMode)){v.sasMode='hold';v.holdQ=v.q.clone();}}
// A part ID survives vessel re-rooting and follows the correct branch on staging.
export function resolveTargets(root,options={}){return resolveWorldTargets(fleet(root),options);}
export function resolveWorldTargets(vessels,{strict=false}={}){const owners=new Map(vessels.flatMap(v=>v.parts.map(p=>[p.id,v])));for(const v of vessels){const target=v.targetPartId?owners.get(v.targetPartId):null;if(v.targetPartId&&(!target||target===v)){if(strict)throw Error('保存された目標が存在しないか自機を指しています');v.targetPartId=null;}v.navigationTarget=target&&target!==v?target:null;if(!v.navigationTarget&&TARGET_MODES.includes(v.sasMode)){if(strict)throw Error('目標なしの相対SASは復帰できません');v.sasMode='hold';v.holdQ=v.q.clone();}if(v.dockingPorts){const a=v.parts.find(p=>p.id===v.dockingPorts.own),b=v.navigationTarget?.parts.find(p=>p.id===v.dockingPorts.target);if(!a||!b||!PARTS[a.type].docking||!PARTS[b.type].docking||a.dockPartner||b.dockPartner){if(strict)throw Error('保存されたポート選択が不正です');v.dockingPorts=null;v.portTranslationEnabled=false;}}if(!v.dockingPorts&&(v.sasMode==='dock'||v.portTranslationEnabled)){if(strict)throw Error('ポートなしの誘導は復帰できません');v.sasMode='hold';v.holdQ=v.q.clone();v.portTranslationEnabled=false;}}}

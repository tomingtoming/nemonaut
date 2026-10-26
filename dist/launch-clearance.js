import * as T from 'three';
import {PARTS} from './catalog.js';
import {partCenter,partRotation} from './aero.js';
function bounds(v){const box=new T.Box3();for(const p of v.parts){const center=partCenter(p),q=partRotation(p),size=PARTS[p.type].size;for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])box.expandByPoint(new T.Vector3(x*size[0]/2,y*size[1]/2,z*size[2]/2).applyQuaternion(q).add(center).applyQuaternion(v.q).add(v.pos));}return box;}
export function launchObstructions(candidate,others){
 if(!['land','runway','water'].includes(candidate.environment))return [];
 const envelope=bounds(candidate).expandByScalar(2);
 return others.filter(v=>envelope.intersectsBox(bounds(v))).map(v=>({id:v.vesselId,name:v.vesselName||'名称未設定の機体'}));
}
export function assertLaunchClear(candidate,others){const blockers=launchObstructions(candidate,others);if(!blockers.length)return;const error=new Error('出発地点を使用中：'+blockers.map(v=>v.name).join('、'));error.code='launch_site_occupied';error.blockers=blockers;throw error;}

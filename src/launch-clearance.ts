import * as T from 'three';
import {PARTS,type PartCatalog} from './catalog.js';
import {partCenter,partRotation,type AeroPart} from './aero.js';
/** The vessel fields the launch clearance check reads. */
export interface ClearanceVessel{parts:readonly AeroPart[];q:T.Quaternion;pos:T.Vector3;vesselId:string;vesselName?:string|null;environment:string}
export interface LaunchBlocker{id:string;name:string}
export interface LaunchSiteError extends Error{code?:string;blockers?:LaunchBlocker[]}
function bounds(v:ClearanceVessel):T.Box3{const box=new T.Box3();for(const p of v.parts){const center=partCenter(p),q=partRotation(p),size=(PARTS as PartCatalog)[p.type].size;for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])box.expandByPoint(new T.Vector3(x*size[0]/2,y*size[1]/2,z*size[2]/2).applyQuaternion(q).add(center).applyQuaternion(v.q).add(v.pos));}return box;}
export function launchObstructions(candidate:ClearanceVessel,others:readonly ClearanceVessel[]):LaunchBlocker[]{
 if(!['land','runway','water'].includes(candidate.environment))return [];
 const envelope=bounds(candidate).expandByScalar(2);
 return others.filter(v=>envelope.intersectsBox(bounds(v))).map(v=>({id:v.vesselId,name:v.vesselName||'名称未設定の機体'}));
}
export function assertLaunchClear(candidate:ClearanceVessel,others:readonly ClearanceVessel[]):void{const blockers=launchObstructions(candidate,others);if(!blockers.length)return;const error:LaunchSiteError=new Error('出発地点を使用中：'+blockers.map(v=>v.name).join('、'));error.code='launch_site_occupied';error.blockers=blockers;throw error;}

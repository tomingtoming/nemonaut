// The inertia tensor of a vessel about a point (moved from docking.ts unchanged so that vessel-collision does not
// import docking, which imports core). No import-time side effects; docking.ts re-exports it.
import * as T from 'three';
import {PARTS} from './catalog.js';
import {partRotation,partMass,partCenter} from './aero.js';
import type {CenteredVessel} from './relative-navigation.js';
// Match the cuboid / wheel-sphere mass model used by the Rapier colliders.
export function inertiaAbout(v:CenteredVessel,point:T.Vector3):T.Matrix3{const tensor=new T.Matrix3().set(0,0,0,0,0,0,0,0,0);for(const p of v.parts){const d=PARTS[p.type],m=partMass(p,v.fuel,v.ballast,v.thermal),[x,y,z]=d.size.map(n=>Math.max(.04,n)),q=v.q.clone().multiply(partRotation(p)),r=new T.Matrix3().setFromMatrix4(new T.Matrix4().makeRotationFromQuaternion(q)),sphere=.4*m*.35**2,local=new T.Matrix3().set(d.wheel?sphere:m*(y*y+z*z)/12,0,0,0,d.wheel?sphere:m*(x*x+z*z)/12,0,0,0,d.wheel?sphere:m*(x*x+y*y)/12),world=r.clone().multiply(local).multiply(r.clone().transpose()),offset=partCenter(p).applyQuaternion(v.q).add(v.pos).sub(point),a=offset.toArray(),s=offset.lengthSq();for(let i=0;i<3;i++)for(let j=0;j<3;j++)tensor.elements[j*3+i]+=world.elements[j*3+i]+m*((i===j?s:0)-a[i]*a[j]);}return tensor;}

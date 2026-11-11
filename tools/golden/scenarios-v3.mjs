import * as T from 'three';
import {Flight} from '../../dist/core.js';
import {part,preset} from '../../dist/catalog.js';
import {saveFlight} from '../../dist/flight-save.js';
import {bodyUp} from '../../dist/celestial.js';
// Golden v3: vessel-vessel collision enabled. Recorded on the Rust engine, the game's only physics.
export function scenarios(){
 const result=[];
 const add=(name,f,ticks,mode,actions=[])=>{result.push({name,dt:1/120,ticks,mode,vesselCollision:true,initial:saveFlight(f),actions,checkpoints:[0,Math.floor(ticks/4),Math.floor(ticks/2),ticks]});f.dispose();};
 // Two orbiters side by side along A's local X; B approaches at `speed` m/s.
 const orbiters=speed=>{const a=new Flight(preset('orbiter'),'orbit'),b=new Flight(preset('orbiter'),'orbit');a.sas=b.sas=false;const axis=new T.Vector3(1,0,0).applyQuaternion(a.q);b.pos.copy(a.pos).addScaledVector(axis,6);b.q.copy(a.q);b.vel.copy(a.vel).addScaledVector(axis,-speed);a.detached.push(b);return a;};
 add('orbit-bump-2ms',orbiters(2),600,'trajectory',[{tick:300,kind:'restore'}]);
 add('orbit-crash-30ms',orbiters(30),240,'impact',[{tick:120,kind:'restore'}]);
 // v1 fuel-tank-impact again, now with fragments colliding with each other.
 const root=part('probe',[0,2,0]),tank=part('tank',[0,0,0],[0,0,0],root.id);tank.fuelLoad=1;
 const f=new Flight([root,tank],'land');f.pos.y+=3;f.vel.addScaledVector(bodyUp(f.pos,0),-20);
 add('fuel-tank-impact-fragments-collide',f,360,'impact',[{tick:240,kind:'restore'}]);
 return result;
}

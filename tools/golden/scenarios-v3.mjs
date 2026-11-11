import {readFileSync} from 'node:fs';
import * as T from 'three';
import {Flight} from '../../dist/core.js';
import {part,preset} from '../../dist/catalog.js';
import {saveFlight} from '../../dist/flight-save.js';
import {bodyUp} from '../../dist/celestial.js';
// Golden v3: recorded on the Rust engine, the game's only physics. The cases built here enable
// vessel-vessel collision; a case taken over from a frozen baseline keeps its definition as recorded.
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
 // v2 capsule-tank-impulse-ranking again, with the same initial state and actions: from about one
 // second in the capsule rests on the ground with SAS on. v2 no longer compares its charge at the
 // last checkpoint (tools/golden/retired.mjs); this case pins the whole run on the current engine.
 const v2=JSON.parse(readFileSync(new URL('../../tests/golden/js-v2.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
 const capsule=v2.cases.find(c=>c.definition.name==='capsule-tank-impulse-ranking');
 if(!capsule)throw Error('js-v2.json has no capsule-tank-impulse-ranking case');
 result.push({...capsule.definition,name:'capsule-tank-rest-after-impact'});
 return result;
}

import * as T from 'three';
import {Flight} from '../../dist/core.js';
import {part,preset} from '../../dist/catalog.js';
import {saveFlight} from '../../dist/flight-save.js';
import {bodyUp} from '../../dist/celestial.js';
export function scenarios(){
 const result=[];
 const add=(name,f,ticks,actions=[],mode='trajectory')=>{result.push({name,dt:1/120,ticks,mode,initial:saveFlight(f),actions,checkpoints:[0,Math.floor(ticks/4),Math.floor(ticks/2),ticks]});f.dispose();};
 const rover=new Flight(preset('rover'),'land');rover.reactionEnabled=false;
 add('rover-drive-turn-brake-save',rover,1800,[{tick:120,kind:'stage'},{tick:120,kind:'input',value:{drive:1}},{tick:480,kind:'input',value:{drive:1,yaw:1}},{tick:960,kind:'set',value:{brake:true}},{tick:960,kind:'input',value:{}},{tick:1440,kind:'restore'}]);
 for(const kind of ['plane','plane-large']){
  const f=new Flight(preset(kind),'runway');f.sas=false;const up=bodyUp(f.pos,0);f.pos.addScaledVector(up,.25);f.vel.addScaledVector(up,-2);
  add(kind+'-gentle-touchdown',f,480);
 }
 const orbit=new Flight(preset('orbiter'),'orbit');orbit.sas=false;
 add('orbit-drift-save',orbit,3600,[{tick:1800,kind:'restore'}]);
 const staged=new Flight(preset('returner'),'orbit');staged.sas=false;
 add('orbital-stage-resources',staged,600,[{tick:0,kind:'stage'},{tick:0,kind:'set',value:{throttle:.3}},{tick:120,kind:'stage'},{tick:240,kind:'set',value:{throttle:0}},{tick:360,kind:'stage'},{tick:480,kind:'restore'}]);
 for(const loaded of [false,true]){
  const root=part('probe',[0,2,0]),tank=part('tank',[0,0,0],[0,0,0],root.id);tank.fuelLoad=loaded?1:0;
  const f=new Flight([root,tank],'land');f.pos.y+=3;f.vel.addScaledVector(bodyUp(f.pos,0),-20);
  add(loaded?'fuel-tank-impact':'empty-tank-impact',f,360,[{tick:240,kind:'restore'}],'impact');
 }
 const root=part('probe',[0,0,0]),wing=part('wing',[2,0,0],[0,0,0],root.id),overload=new Flight([root,wing],'land');overload.pos.y+=200;overload.vel.add(new T.Vector3(0,0,500));
 add('wing-overload',overload,120,[],'impact');
 return result;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {sasTrim} from '../dist/sas-trim.js';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';

test('aircraft hold rejects sustained aerodynamic bias after manual rotation',()=>{
 const f=new Flight(preset('plane'),'runway',159542);
 try{
  f.throttle=1;f.stageNext();let largest=0;
  for(let i=0;i<65*120;i++){
   const t=i/120;f.step(1/120,{pitch:t>10&&t<28?-1:0});
   if(t>50)largest=Math.max(largest,f.q.angleTo(f.holdQ));
  }
  assert.equal(f.crashed,false);assert.ok(f.orbit.altitude>300);
  assert.ok(largest<3*Math.PI/180,`settled attitude error ${largest*180/Math.PI}`);
 }finally{f.dispose();}
});

test('trim cannot wind up into saturation, unsupported axes or a new control session',()=>{
 const v={sasMode:'hold'},axes={x:true,y:false,z:false};
 for(let i=0;i<10000;i++)sasTrim(v,new T.Vector3(1,1,1),new T.Vector3(),axes,1/120,true);
 assert.deepEqual(sasTrim(v,new T.Vector3(),new T.Vector3(),axes,0,true).toArray(),[.8,0,0]);
 assert.equal(sasTrim(v,new T.Vector3(1,0,0),new T.Vector3(1,0,0),axes,1,true).x,.8);
 assert.ok(sasTrim(v,new T.Vector3(-.1,0,0),new T.Vector3(1,0,0),axes,1,true).x<.8);
 assert.equal(sasTrim(v,null,null,null,1,false).length(),0);
 assert.equal(sasTrim(v,new T.Vector3(),new T.Vector3(),axes,1,true).length(),0);
 sasTrim(v,new T.Vector3(.2,0,0),new T.Vector3(),axes,1,true);v.sasMode='prograde';
 assert.equal(sasTrim(v,new T.Vector3(),new T.Vector3(),axes,0,true).length(),0);
});

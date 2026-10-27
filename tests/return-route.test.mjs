import test from 'node:test';
import assert from 'node:assert/strict';
import {planReturnRoute,routePoint} from '../tools/return-route.mjs';
const angleError=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
test('return paths preserve both poses and tangent continuity across varied positions and headings',()=>{
 const goal={x:0,y:-8000,heading:Math.PI/2};
 let count=0;
 for(const x of [-18000,-3000,0,5000,17000])for(const y of [-21000,-8000,4000,14000])for(const heading of [0,.7,Math.PI,4.9])for(const radius of [900,2400]){
  const start={x,y,heading},r=planReturnRoute(start,goal,{radius});count++;
  for(const [point,expected] of [[routePoint(r,0),start],[routePoint(r,r.length),goal]]){
   near(point.x,expected.x);near(point.y,expected.y);near(angleError(point.heading,expected.heading),0);
  }
  let distance=0;
  for(const s of r.segments.slice(0,-1)){
   distance+=s.length;
   const before=routePoint(r,Math.max(0,distance-1e-4)),after=routePoint(r,distance+1e-4);
   assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<.00021);
   assert.ok(Math.abs(angleError(after.heading,before.heading))<1e-6);
  }
  for(let d=0;d<r.length;d+=137)assert.ok(Math.abs(routePoint(r,d).curvature)<=1/radius+1e-12);
 }
 assert.equal(count,160);
});
test('additional holding turns provide requested path length without moving the target',()=>{
 const start={x:4000,y:3000,heading:1},goal={x:0,y:-8000,heading:Math.PI/2};
 const r=planReturnRoute(start,goal,{radius:2000,minLength:90000});
 assert.ok(r.length>=90000&&r.length<90000+2*Math.PI*2000);
 assert.ok(r.loops>0);
 const end=routePoint(r,r.length);near(end.x,goal.x);near(end.y,goal.y);near(angleError(end.heading,goal.heading),0);
});
test('invalid flight geometry is rejected instead of producing NaN commands',()=>{
 const p={x:0,y:0,heading:0};
 for(const radius of [0,-1,NaN,Infinity])assert.throws(()=>planReturnRoute(p,p,{radius}),RangeError);
 assert.throws(()=>planReturnRoute({...p,x:NaN},p,{radius:1000}),RangeError);
 assert.throws(()=>planReturnRoute(p,p,{radius:1000,minLength:-1}),RangeError);
});

import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {lambertArc} from '../dist/lambert.js';import {keplerDrift} from '../dist/coast-orbit.js';
const mu=3.5316e12,normal=new T.Vector3(1,0,0);
test('Lambert recovers short and long circular arcs and leaves inputs unchanged',()=>{
 const r=680000,period=2*Math.PI*Math.sqrt(r**3/mu),from=new T.Vector3(0,r,0),speed=Math.sqrt(mu/r);
 for(const fraction of [.1,.3,.7,.9]){const angle=fraction*2*Math.PI,to=new T.Vector3(0,r*Math.cos(angle),r*Math.sin(angle)),copy=to.clone(),arc=lambertArc(from,to,period*fraction,mu,normal);
  assert.ok(arc.departure.distanceTo(new T.Vector3(0,0,speed))<1e-5);assert.ok(keplerDrift(from,arc.departure,mu,period*fraction).position.distanceTo(to)<.01);assert.ok(to.equals(copy));assert.deepEqual(from.toArray(),[0,r,0]);
 }
});
test('Lambert recovers eccentric and fast hyperbolic arcs in rotated planes',()=>{
 for(const speed of [2400,4000]){const p=new T.Vector3(0,680000,0),v=new T.Vector3(0,150,speed),rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),.7);p.applyQuaternion(rotation);v.applyQuaternion(rotation);const n=p.clone().cross(v).normalize(),end=keplerDrift(p,v,mu,700),arc=lambertArc(p,end.position,700,mu,n);assert.ok(arc.departure.distanceTo(v)<1e-5);assert.ok(arc.arrival.distanceTo(end.velocity)<1e-5);}
});
test('Lambert rejects invalid and collinear inputs',()=>{const p=new T.Vector3(0,680000,0),q=new T.Vector3(0,0,12000000);for(const time of [0,-1,NaN])assert.throws(()=>lambertArc(p,q,time,mu,normal));assert.throws(()=>lambertArc(p,p.clone().negate(),100,mu,normal));});

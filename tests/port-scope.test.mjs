import test from 'node:test';import assert from 'node:assert/strict';import {portScope} from '../dist/port-scope.js';
test('Port scope points along signed drift, stays still at zero rate, and uses stable scale steps',()=>{
 const g={horizontal:.1,vertical:.1,horizontalSpeed:.02,verticalSpeed:-.02},s=portScope(g);assert.equal(s.scale,.5);assert.ok(s.future.x>s.current.x);assert.ok(s.future.y>s.current.y);assert.deepEqual(portScope({...g,horizontalSpeed:0,verticalSpeed:0}).future,s.current);assert.equal(portScope({...g,horizontal:.2}).scale,.5);
 const fast=portScope({...g,horizontalSpeed:100,verticalSpeed:-100});assert.equal(fast.future.x,200);assert.equal(fast.future.y,140);assert.equal(portScope({...g,horizontal:1}).scale,2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {Flight} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {TakeoffPrototype} from '../tools/takeoff-prototype.mjs';
import {TakeoffPreviewClient} from '../tools/takeoff-preview-client.mjs';
const setup=()=>{const f=new Flight(preset('plane-large'),'runway',161700);f.stageNext();return {f,p:new TakeoffPrototype(f,{speed:90,rotation:12,integral:true,handoff:'attitude'})};};
const good={status:'airborne',lastGround:{along:1200,cross:0,time:20},elapsedMs:1};
test('superseded, cancelled and stale replies cannot become a current forecast',async()=>{
 const {f,p}=setup(),workers=[];
 const c=new TakeoffPreviewClient(()=>{const w={postMessage(v){this.sent=v;},terminate(){this.closed=true;}};workers.push(w);return w;});
 try{
  const first=c.request(f,p);assert.equal(workers[0].sent,undefined);workers[0].onmessage({data:{type:'ready'}});
  const second=c.request(f,p);workers[1].onmessage({data:{type:'ready'}});assert.equal((await first).status,'cancelled');assert.ok(workers[0].closed);
  workers[0].onmessage({data:{...workers[0].sent,result:good}});assert.equal(c.pending.worker,workers[1]);
  workers[1].onmessage({data:{...workers[1].sent,id:999,result:good}});assert.ok(c.pending);
  workers[1].onmessage({data:{...workers[1].sent,result:good}});assert.equal((await second).status,'airborne');
  const stale=c.request(f,p);workers[2].onmessage({data:{type:'ready'}});f.universalTime+=6;workers[2].onmessage({data:{...workers[2].sent,result:good}});assert.equal((await stale).status,'stale');
  const cancelled=c.request(f,p);c.cancel();assert.equal((await cancelled).status,'cancelled');
 }finally{c.cancel();f.dispose();}
});
test('failed and timed out workers release resources',async()=>{
 const {f,p}=setup();let worker;
 const c=new TakeoffPreviewClient(()=>worker={postMessage(){},terminate(){this.closed=true;}},{timeoutMs:20});
 try{
  const timed=c.request(f,p);await assert.rejects(timed,/timed out/);assert.ok(worker.closed);assert.equal(c.pending,null);
  const failed=c.request(f,p);worker.onerror();await assert.rejects(failed,/worker failed/);assert.ok(worker.closed);
 }finally{c.cancel();f.dispose();}
});
test('real worker performs physics while the calling event loop continues',async()=>{
 const {f,p}=setup();let ticks=0;const timer=setInterval(()=>ticks++,10);
 const c=new TakeoffPreviewClient(()=>{
  const w=new Worker(new URL('./fixtures/takeoff-worker.mjs',import.meta.url));
  const adapter={postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};
  w.on('message',data=>adapter.onmessage({data}));w.on('error',()=>adapter.onerror());return adapter;
 });
 try{const result=await c.request(f,p,{seconds:40});assert.equal(result.status,'airborne');assert.ok(result.lastGround.along<1600);assert.ok(ticks>2);assert.equal(f.time,0);}
 finally{clearInterval(timer);c.cancel();f.dispose();}
});

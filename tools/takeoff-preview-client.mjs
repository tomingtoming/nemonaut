import {createTakeoffRequest} from './takeoff-preview.mjs';
// One worker per request allows cancellation during a synchronous physics roll.
// The caller must invalidate on manual input, settings changes and vessel switch.
export class TakeoffPreviewClient{
 constructor(makeWorker,{timeoutMs=15000,maxAge=5}={}){this.makeWorker=makeWorker;this.timeoutMs=timeoutMs;this.maxAge=maxAge;this.sequence=0;this.pending=null;}
 cancel(){const old=this.pending;this.pending=null;if(old){clearTimeout(old.timer);old.worker.terminate();old.resolve({status:'cancelled'});}}
 request(f,p,options={}){
  const payload=createTakeoffRequest(f,p,options);this.cancel();
  const id=++this.sequence,vesselId=f.vesselId,epoch=f.universalTime;
  return new Promise((resolve,reject)=>{
   let worker;try{worker=this.makeWorker();}catch(error){reject(error);return;}
   const pending={worker,resolve,reject,id,vesselId,epoch};this.pending=pending;
   const finish=(error,result)=>{if(this.pending!==pending)return;this.pending=null;clearTimeout(pending.timer);worker.terminate();error?reject(error):resolve(result);};
   pending.timer=setTimeout(()=>finish(Error('Takeoff forecast timed out')),this.timeoutMs);
   worker.onmessage=({data})=>{
    if(this.pending!==pending)return;
    if(data.type==='ready'&&!pending.sent){pending.sent=true;try{worker.postMessage({id,vesselId,epoch,payload});}catch(error){finish(error);}return;}
    if(!pending.sent)return;
    if(this.pending!==pending||data.id!==id||data.vesselId!==vesselId||data.epoch!==epoch)return;
    if(f.vesselId!==vesselId||f.universalTime<epoch||f.universalTime-epoch>this.maxAge){finish(null,{status:'stale'});return;}
    if(data.error){finish(Error(data.error));return;}
    const r=data.result;
    if(!r||!['airborne','crashed','unresolved'].includes(r.status)||(r.status==='airborne'&&(!r.lastGround||!['along','cross','time'].every(k=>Number.isFinite(r.lastGround[k]))))){finish(Error('Invalid forecast result'));return;}
    finish(null,{...r,vesselId,epoch});
   };
   worker.onerror=()=>finish(Error('Takeoff forecast worker failed'));
  });
 }
}

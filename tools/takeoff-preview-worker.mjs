import {runTakeoffPreview} from './takeoff-preview.mjs';
export function handleTakeoffRequest({id,vesselId,epoch,payload}){
 try{
  if(!Number.isInteger(id)||id<1||vesselId!==payload?.flight?.vesselId||epoch!==payload?.flight?.universalTime)throw Error('Mismatched forecast snapshot');
  return {id,vesselId,epoch,result:runTakeoffPreview(payload)};
 }catch(error){return {id,vesselId,epoch,error:error.message};}
}
globalThis.onmessage=({data})=>globalThis.postMessage(handleTakeoffRequest(data));
// Imports include asynchronous Rapier initialization. Do not accept a request
// until that initialization and the message handler installation have completed.
if(typeof globalThis.postMessage==='function')globalThis.postMessage({type:'ready'});

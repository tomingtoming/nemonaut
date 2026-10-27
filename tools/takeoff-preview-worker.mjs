import {runTakeoffPreview} from './takeoff-preview.mjs';
export function handleTakeoffRequest({id,vesselId,epoch,payload}){
 try{
  if(!Number.isInteger(id)||id<1||vesselId!==payload?.flight?.vesselId||epoch!==payload?.flight?.universalTime)throw Error('Mismatched forecast snapshot');
  return {id,vesselId,epoch,result:runTakeoffPreview(payload)};
 }catch(error){return {id,vesselId,epoch,error:error.message};}
}
globalThis.onmessage=({data})=>globalThis.postMessage(handleTakeoffRequest(data));

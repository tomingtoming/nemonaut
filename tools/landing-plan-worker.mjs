import {loadFlight} from '../dist/flight-save.js';
import {bodyAltitude,bodyGravity} from '../dist/celestial.js';
import {atmosphere} from '../dist/planet.js';
import {planLandingTrim} from './landing-trim.mjs';
export function handleLandingPlan({id,vesselId,epoch,flight}){
 let clone;
 try{
  if(!Number.isInteger(id)||id<1||vesselId!==flight?.vesselId||epoch!==flight?.universalTime)throw Error('Mismatched landing snapshot');
  clone=loadFlight(flight);
  const center=clone.pos.clone().add(clone.stats.com.clone().applyQuaternion(clone.q));
  const plan=planLandingTrim(clone,{density:atmosphere(bodyAltitude(center,clone.universalTime)).density,gravity:bodyGravity(center,clone.universalTime).length()});
  return {id,vesselId,epoch,result:plan?{status:'ready',plan}:{status:'unavailable'}};
 }catch(error){return {id,vesselId,epoch,error:error.message};}
 finally{clone?.dispose();}
}
globalThis.onmessage=({data})=>globalThis.postMessage(handleLandingPlan(data));
if(typeof globalThis.postMessage==='function')globalThis.postMessage({type:'ready'});

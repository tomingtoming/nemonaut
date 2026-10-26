import {departureMode} from './departure-mode.js';

export function launchOrigins(history){
 const origins=new Map();
 for(const event of history)if(event.type==='launch')for(const id of event.partIds??[])origins.set(id,event);
 return origins;
}
// Every current part needs a known surface departure, including parts added by
// docking. Neither vessel names nor the retained vessel ID prove provenance.
export function surfaceOrigins(partIds,origins){
 if(!partIds.length)return null;
 const events=new Set();
 for(const id of partIds){
  const source=origins.get(id);
  if(!source||source.environment===undefined||departureMode(source.environment).mode!=='surface')return null;
  events.add(source.id);
 }
 return [...events].sort();
}

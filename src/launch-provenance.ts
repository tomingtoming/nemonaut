import {departureMode} from './departure-mode.js';
/** The history event fields provenance reads. */
export interface ProvenanceEvent{id:string;type:string;partIds?:readonly string[]|null;environment?:string}

export function launchOrigins<E extends ProvenanceEvent=ProvenanceEvent>(history:Iterable<E>):Map<string,E>{
 const origins=new Map<string,E>();
 for(const event of history)if(event.type==='launch')for(const id of event.partIds??[])origins.set(id,event);
 return origins;
}
// Every current part needs a known surface departure, including parts added by
// docking. Neither vessel names nor the retained vessel ID prove provenance.
export function surfaceOrigins(partIds:readonly string[],origins:ReadonlyMap<string,ProvenanceEvent>):string[]|null{
 if(!partIds.length)return null;
 const events=new Set<string>();
 for(const id of partIds){
  const source=origins.get(id);
  if(!source||source.environment===undefined||departureMode(source.environment).mode!=='surface')return null;
  events.add(source.id);
 }
 return [...events].sort();
}

export function orbitalOrigins(history:Iterable<ProvenanceEvent>,type='orbit'):Map<string,string>{
 const origins=new Map<string,string>();
 for(const event of history)if(event.type===type)for(const id of event.partIds??[])if(!origins.has(id))origins.set(id,event.id);
 return origins;
}
export function orbitalReturnSources(partIds:readonly string[],origins:ReadonlyMap<string,string>):string[]|null{
 if(!partIds.length)return null;
 const sources:string[]=[];for(const id of partIds){const origin=origins.get(id);if(origin===undefined)return null;sources.push(origin);}
 return [...new Set(sources)].sort();
}

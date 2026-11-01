import {PARTS} from './catalog.js';
import {createFuel,fuelNetworks} from './resources.js';
// Current connected propellant, not a forecast of fuel left after earlier stages.
export function stageFuelLevels(parts,fuel=createFuel(parts)){
 const networks=fuelNetworks(parts),levels=new Map<any,any>();
 for(const p of parts){if(!PARTS[p.type].thrust||PARTS[p.type].water)continue;
  if(!levels.has(p.stage))levels.set(p.stage,{tanks:new Map<any,any>(),engines:[],unfed:0});
  const level=levels.get(p.stage),tanks=networks.network.get(p.id).tanks;level.engines.push(p.id);
  if(!tanks.some(t=>(fuel.get(t.id)||0)>0))level.unfed++;
  for(const t of tanks)level.tanks.set(t.id,t);
 }
 return new Map<any,any>([...levels].map(([stage,level])=>[stage,{engines:level.engines,unfed:level.unfed,capacity:[...level.tanks.values()].reduce((n,t)=>n+PARTS[t.type].fuel,0),remaining:[...level.tanks.keys()].reduce((n,id)=>n+(fuel.get(id)||0),0)}]));
}

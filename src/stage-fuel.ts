import {PARTS} from './catalog.js';
import {createFuel,fuelNetworks,type ResourcePart} from './resources.js';
/** One stage's engines and the propellant currently connected to them (kg). */
export interface StageFuelLevel{engines:string[];unfed:number;capacity:number;remaining:number}
// Current connected propellant, not a forecast of fuel left after earlier stages.
export function stageFuelLevels(parts:readonly ResourcePart[],fuel:ReadonlyMap<string,number>=createFuel(parts)):Map<number,StageFuelLevel>{
 const networks=fuelNetworks(parts),levels=new Map<number,{tanks:Map<string,ResourcePart>;engines:string[];unfed:number}>();
 for(const p of parts){if(!PARTS[p.type].thrust||PARTS[p.type].water)continue;
  if(!levels.has(p.stage))levels.set(p.stage,{tanks:new Map<string,ResourcePart>(),engines:[],unfed:0});
  const level=levels.get(p.stage)!,tanks=networks.network.get(p.id)!.tanks;level.engines.push(p.id);
  if(!tanks.some(t=>(fuel.get(t.id)||0)>0))level.unfed++;
  for(const t of tanks)level.tanks.set(t.id,t);
 }
 return new Map<number,StageFuelLevel>([...levels].map(([stage,level]):[number,StageFuelLevel]=>[stage,{engines:level.engines,unfed:level.unfed,capacity:[...level.tanks.values()].reduce((n,t)=>n+PARTS[t.type].fuel!,0),remaining:[...level.tanks.keys()].reduce((n,id)=>n+(fuel.get(id)||0),0)}]));
}

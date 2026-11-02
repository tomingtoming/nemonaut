import {PARTS} from './catalog.js';
import {createFuel,fuelNetworks,type ResourcePart} from './resources.js';
/** One stage's engines and the propellant currently connected to them (kg). */
export interface StageFuelLevel{engines:string[];unfed:number;capacity:number;remaining:number}
// Fuel networks list only parts with a fuel capacity as tanks.
function tankCapacity(t:ResourcePart):number{const fuel=PARTS[t.type].fuel;if(fuel===undefined)throw Error('燃料タンクの容量が定義されていません');return fuel;}
// Current connected propellant, not a forecast of fuel left after earlier stages.
export function stageFuelLevels(parts:readonly ResourcePart[],fuel:ReadonlyMap<string,number>=createFuel(parts)):Map<number,StageFuelLevel>{
 const networks=fuelNetworks(parts),levels=new Map<number,{tanks:Map<string,ResourcePart>;engines:string[];unfed:number}>();
 for(const p of parts){if(!PARTS[p.type].thrust||PARTS[p.type].water)continue;
  let level=levels.get(p.stage);if(!level){level={tanks:new Map<string,ResourcePart>(),engines:[],unfed:0};levels.set(p.stage,level);}
  const network=networks.network.get(p.id);if(!network)throw Error('エンジンの燃料系統が見つかりません');
  const tanks=network.tanks;level.engines.push(p.id);
  if(!tanks.some(t=>(fuel.get(t.id)||0)>0))level.unfed++;
  for(const t of tanks)level.tanks.set(t.id,t);
 }
 return new Map<number,StageFuelLevel>([...levels].map(([stage,level]):[number,StageFuelLevel]=>[stage,{engines:level.engines,unfed:level.unfed,capacity:[...level.tanks.values()].reduce((n,t)=>n+tankCapacity(t),0),remaining:[...level.tanks.keys()].reduce((n,id)=>n+(fuel.get(id)||0),0)}]));
}

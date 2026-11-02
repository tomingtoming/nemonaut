import {PARTS,type PartCatalog,type Part} from './catalog.js';
import {canControl,type ControllableVessel} from './fleet.js';
import {fuelNetworks,type ResourcePart,type FuelMap} from './resources.js';
/** A vessel whose tanks can exchange propellant: parts, kg-by-part-id stores and optional thermal failures. */
export interface TransferVessel<P extends ResourcePart=ResourcePart> extends ControllableVessel{parts:readonly P[];fuel:FuelMap;thermal?:ReadonlyMap<string,{failed?:boolean}>|null}
export const transferCapacity=(p:Pick<ResourcePart,'type'>):number=>(PARTS as PartCatalog)[p.type].fuel||(PARTS as PartCatalog)[p.type].monoprop||0;
const resourceKind=(p:Pick<ResourcePart,'type'>):'fuel'|'monoprop'|null=>(PARTS as PartCatalog)[p.type].fuel?'fuel':(PARTS as PartCatalog)[p.type].monoprop?'monoprop':null;
export function transferTargets<P extends ResourcePart=Part>(f:TransferVessel<P>,id:string):P[]{
 const p=f?.parts.find(p=>p.id===id);if(!p||!canControl(f)||!transferCapacity(p)||f.thermal?.get(id)?.failed)return [];
 const group=fuelNetworks(f.parts).network.get(id);
 return group!.parts.filter(q=>resourceKind(q)===resourceKind(p)&&q.id!==id&&!f.thermal?.get(q.id)?.failed);
}
// A bounded transaction: validate both stores before changing either of them.
export function transferFuel(f:TransferVessel,from:string,to:string,requested:number):number{
 if(!Number.isFinite(requested)||requested<=0||!transferTargets(f,from).some(p=>p.id===to))return 0;
 const a=f.parts.find(p=>p.id===from)!,b=f.parts.find(p=>p.id===to)!,source=f.fuel.get(from) as number,target=f.fuel.get(to) as number,capacity=transferCapacity(b);
 if(!Number.isFinite(source)||!Number.isFinite(target)||source<0||source>transferCapacity(a)||target<0||target>capacity)return 0;
 const moved=Math.min(requested,source,capacity-target);if(moved<=0)return 0;
 f.fuel.set(from,source-moved);f.fuel.set(to,target+moved);return moved;
}

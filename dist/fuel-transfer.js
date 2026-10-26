import {PARTS} from './catalog.js';
import {canControl} from './fleet.js';
import {fuelNetworks} from './resources.js';
export function transferTargets(f,id){
 const p=f?.parts.find(p=>p.id===id);if(!p||!canControl(f)||!PARTS[p.type].fuel||f.thermal?.get(id)?.failed)return [];
 const group=fuelNetworks(f.parts).network.get(id);
 return group.tanks.filter(q=>q.id!==id&&!f.thermal?.get(q.id)?.failed);
}
// A bounded transaction: validate both stores before changing either of them.
export function transferFuel(f,from,to,requested){
 if(!Number.isFinite(requested)||requested<=0||!transferTargets(f,from).some(p=>p.id===to))return 0;
 const a=f.parts.find(p=>p.id===from),b=f.parts.find(p=>p.id===to),source=f.fuel.get(from),target=f.fuel.get(to),capacity=PARTS[b.type].fuel;
 if(!Number.isFinite(source)||!Number.isFinite(target)||source<0||source>PARTS[a.type].fuel||target<0||target>capacity)return 0;
 const moved=Math.min(requested,source,capacity-target);if(moved<=0)return 0;
 f.fuel.set(from,source-moved);f.fuel.set(to,target+moved);return moved;
}

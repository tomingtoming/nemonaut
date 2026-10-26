import {powerTotals} from './power.js';
import * as T from 'three';
import {DELIVERY_SITE,deliveryDistance} from './delivery-sites.js';
// Follow the recorded probe part across separation/docking and vessel renames.
// Accept live vessels or saved world vessels without constructing a simulation.
export function deliveryStation(history,vessels,site=DELIVERY_SITE){
 const record=history.find(e=>e.type==='delivery'&&e.siteId===site.id);
 if(!record)return null;
 const vessel=vessels.find(v=>v.parts.some(p=>p.id===record.probePartId&&p.type==='probe'));
 if(!vessel)return {record,vessel:null};
 const probe=vessel.parts.find(p=>p.id===record.probePartId),pos=Array.isArray(vessel.pos)?new T.Vector3(...vessel.pos):vessel.pos,q=Array.isArray(vessel.q)?new T.Quaternion(...vessel.q):vessel.q;
 const point=new T.Vector3(...probe.p).applyQuaternion(q).add(pos),state=vessel.state??vessel,charge=new Map(vessel.charge),thermal=new Map(vessel.thermal);
 return {record,vessel,power:powerTotals(vessel.parts,charge),distance:deliveryDistance(point,vessel.universalTime,site),charge:charge.get(probe.id)??0,damaged:state.crashed||[...thermal.values()].some(s=>s.failed),landed:state.landed};
}

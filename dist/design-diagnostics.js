import * as T from 'three';
import {PARTS} from './catalog.js';
import {partCenter,partMass,partRotation} from './aero.js';
import {createFuel,fuelNetworks,engineBurn} from './resources.js';
import {stagePlan} from './staging.js';

// Neutral gimbals, full throttle, stated density. No aerodynamic or control
// compensation is assumed. Use the same force application points as Flight.
export function thrustBalance(parts,active,fuel=createFuel(parts),density=1.225){
 const com=new T.Vector3(),force=new T.Vector3(),torque=new T.Vector3();let mass=0;
 for(const p of parts){const m=partMass(p,fuel);mass+=m;com.addScaledVector(partCenter(p),m);}com.divideScalar(mass||1);
 const thrust=engineBurn(fuelNetworks(parts),new Map(fuel),active,1,density,.001),engineIds=[];
 for(const p of parts){const n=thrust.get(p.id)||0;if(n<=0)continue;engineIds.push(p.id);
  const d=PARTS[p.type],q=partRotation(p),f=new T.Vector3(0,n,0).applyQuaternion(q),point=partCenter(p);
  if(d.gimbal)point.add(new T.Vector3(...d.gimbalPivot).applyQuaternion(q));
  force.add(f);torque.add(point.sub(com).cross(f));
 }
 const magnitude=force.length(),direction=magnitude>1e-8?force.clone().divideScalar(magnitude):null;
 const axialTorque=direction?torque.dot(direction):null;
 const offset=direction?torque.clone().addScaledVector(direction,-axialTorque).length()/magnitude:null;
 return {mass,com:com.toArray(),force:force.toArray(),torque:torque.toArray(),thrust:magnitude,offset,axialTorque,engineIds};
}

// Follow the component containing the selected control as separator edges open.
// Sequential reference burns empty only tanks feeding the active engines.
export function stageThrustDiagnostics(parts,referenceId=null,{density=1.225,includeInactive=false}={}){
 const reference=parts.find(p=>p.id===referenceId&&PARTS[p.type].control)||parts.find(p=>PARTS[p.type].control);
 if(!reference)return {referenceId:null,stages:[]};
 let retained=structuredClone(parts);const fuel=createFuel(parts),active=new Set(),stages=[];
 for(const slot of stagePlan(parts)){
  retained=retained.map(p=>p.parent&&PARTS[p.type].decoupler&&p.stage===slot.stage?{...p,parent:null}:p);
  const ids=new Set([reference.id]);let changed=true;
  while(changed){changed=false;for(const p of retained)if(p.parent&&(ids.has(p.id)||ids.has(p.parent))){if(!ids.has(p.id)){ids.add(p.id);changed=true;}if(!ids.has(p.parent)){ids.add(p.parent);changed=true;}}}
  retained=retained.filter(p=>ids.has(p.id));
  for(const p of retained)if(p.stage===slot.stage&&PARTS[p.type].thrust)active.add(p.id);
  const networks=fuelNetworks(retained),full=thrustBalance(retained,active,fuel,density),lowFuel=new Map(fuel);
  const fed=networks.groups.filter(g=>g.engines.some(p=>full.engineIds.includes(p.id)));
  for(const g of fed)for(const tank of g.tanks)lowFuel.set(tank.id,(fuel.get(tank.id)||0)*.1);
  const engineStates=retained.filter(p=>PARTS[p.type].thrust).map(p=>{
   const d=PARTS[p.type],reasons=[];
   if(d.water)reasons.push('water');
   if(!active.has(p.id))reasons.push('not-ignited');
   if(d.air&&density<=0)reasons.push('atmosphere');
   if(!d.water&&!(networks.network.get(p.id)?.tanks.some(t=>(fuel.get(t.id)||0)>0)))reasons.push('fuel');
   return {id:p.id,reasons};
  });
  if(includeInactive||full.engineIds.length)stages.push({stage:slot.stage,full,low:thrustBalance(retained,active,lowFuel,density),partIds:retained.map(p=>p.id),equipment:equipmentDiagnostics(retained),engineStates,actions:slot.actions.map(a=>({...a,retained:ids.has(a.id)}))});
  for(const g of fed)for(const tank of g.tanks)fuel.set(tank.id,0);
 }
 return {referenceId:reference.id,stages};
}

export function equipmentDiagnostics(parts){
 const ids=predicate=>parts.filter(p=>predicate(PARTS[p.type],p)).map(p=>p.id);
 return {controls:ids(d=>d.control),wheels:ids((d,p)=>d.reactionTorque&&p.reactionEnabled!==false),rcs:ids(d=>d.rcsThrust),gimbals:ids(d=>d.gimbal),surfaces:ids(d=>d.controlAxis),shields:ids(d=>d.heatShield),chutes:ids(d=>d.parachute),batteries:ids(d=>d.battery),solar:ids(d=>d.solarPower),capacity:parts.reduce((n,p)=>n+(PARTS[p.type].battery||0),0)};
}


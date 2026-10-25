import * as T from 'three';
// Each nozzle's exhaust points opposite its force. Positions are in part-local meters.
export const RCS_NOZZLES=[...Array(3)].flatMap((_,axis)=>[-1,1].map(sign=>{const direction=[0,0,0];direction[axis]=sign;return {direction,position:direction.map(v=>-.24*v)};}));

// Bounded least-squares mixer. Unachievable commands remain unachievable: the
// returned forces always act at the actual nozzle positions, never as free torque.
export function mixRCS(thrusters,com,rotation,translation){
 const columns=thrusters.map(t=>{const f=t.direction.clone().multiplyScalar(t.thrust),torque=t.position.clone().sub(com).cross(f);return [...f.toArray(),...torque.toArray()];});
 const positive=Array(6).fill(0),negative=Array(6).fill(0);
 for(const col of columns)col.forEach((v,i)=>{positive[i]+=Math.max(0,v);negative[i]+=Math.max(0,-v);});
 const command=[...translation.toArray(),...rotation.toArray()].map(v=>T.MathUtils.clamp(v,-1,1));
 const scale=positive.map((v,i)=>Math.max(v,negative[i],1));
 const residual=command.map((v,i)=>v*(v>=0?positive[i]:negative[i])/scale[i]);
 const matrix=columns.map(col=>col.map((v,i)=>v/scale[i])),levels=thrusters.map(()=>0);
 for(let iteration=0;iteration<120;iteration++)for(let j=0;j<matrix.length;j++){
  const col=matrix[j],norm=col.reduce((s,v)=>s+v*v,0);if(norm<1e-12)continue;
  const next=T.MathUtils.clamp(levels[j]+col.reduce((s,v,i)=>s+v*residual[i],0)/norm,0,1),delta=next-levels[j];
  levels[j]=next;col.forEach((v,i)=>residual[i]-=v*delta);
 }
 return levels;
}

export function rcsThrusters(parts,definitions){return parts.flatMap(p=>{const d=definitions[p.type];if(!d.rcsThrust)return [];const q=new T.Quaternion().setFromEuler(new T.Euler(...p.r));return RCS_NOZZLES.map((n,index)=>({id:p.id,index,position:new T.Vector3(...n.position).applyQuaternion(q).add(new T.Vector3(...p.p)),direction:new T.Vector3(...n.direction).applyQuaternion(q),thrust:d.rcsThrust,isp:d.rcsIsp}));});}

// Internal monopropellant reservoirs supply only their own block. No main-fuel
// crossfeed, and no resource transfer across separated craft.
export function burnRCS(thrusters,levels,propellant,dt){
 const needs=new Map();thrusters.forEach((t,i)=>needs.set(t.id,(needs.get(t.id)||0)+t.thrust*levels[i]*dt/(t.isp*9.81)));
 const fractions=new Map();for(const [id,need]of needs){const available=propellant.get(id)||0;fractions.set(id,need>0?Math.min(1,available/need):0);propellant.set(id,Math.max(0,available-need));}
 return thrusters.map((t,i)=>({...t,level:levels[i]*fractions.get(t.id),force:t.direction.clone().multiplyScalar(t.thrust*levels[i]*fractions.get(t.id))}));
}

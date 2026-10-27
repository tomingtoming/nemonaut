import * as T from 'three';

// Controller memory is transient: load/separation starts from zero, not stale trim.
const memory=new WeakMap();
const pending=new WeakMap();
// Explicit handoff only. Match the previous actuator output against the next
// SAS proportional/rate term, instead of transferring unrelated integrators.
export function seedSasTrim(v,commands){
 if(!v.sas||v.sasMode!=='hold'||!['pitch','yaw','roll'].every(k=>Number.isFinite(commands?.[k])&&Math.abs(commands[k])<=1))return false;
 pending.set(v,{mode:v.sasMode,value:new T.Vector3(commands.pitch,commands.yaw,commands.roll)});return true;
}
export function sasTrim(v,error,base,axes,dt,enabled){
 if(!enabled){memory.delete(v);pending.delete(v);return new T.Vector3();}
 let state=memory.get(v);
 if(!state||state.mode!==v.sasMode){state={mode:v.sasMode,value:new T.Vector3()};memory.set(v,state);}
 const seed=pending.get(v);pending.delete(v);
 if(seed?.mode===v.sasMode)for(const axis of ['x','y','z'])state.value[axis]=axes[axis]?T.MathUtils.clamp(seed.value[axis]-base[axis],-.8,.8):0;
 for(const axis of ['x','y','z']){
  if(!axes[axis]){state.value[axis]=0;continue;}
  const output=base[axis]+state.value[axis];
  // Do not accumulate into saturation; an opposing error may unwind it.
  if(Math.abs(output)<1||Math.sign(error[axis])!==Math.sign(output))
   state.value[axis]=T.MathUtils.clamp(state.value[axis]+error[axis]*.8*dt,-.8,.8);
 }
 return state.value;
}

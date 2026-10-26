import * as T from 'three';

// Controller memory is transient: load/separation starts from zero, not stale trim.
const memory=new WeakMap();
export function sasTrim(v,error,base,axes,dt,enabled){
 if(!enabled){memory.delete(v);return new T.Vector3();}
 let state=memory.get(v);
 if(!state||state.mode!==v.sasMode){state={mode:v.sasMode,value:new T.Vector3()};memory.set(v,state);}
 for(const axis of ['x','y','z']){
  if(!axes[axis]){state.value[axis]=0;continue;}
  const output=base[axis]+state.value[axis];
  // Do not accumulate into saturation; an opposing error may unwind it.
  if(Math.abs(output)<1||Math.sign(error[axis])!==Math.sign(output))
   state.value[axis]=T.MathUtils.clamp(state.value[axis]+error[axis]*.8*dt,-.8,.8);
 }
 return state.value;
}

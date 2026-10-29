import assert from 'node:assert/strict';
export const tolerances={position:.05,velocity:.02,angularVelocity:.002,quaternionRadians:.002,time:.0001,eventTime:.1,fuelAbsolute:.0001,fuelRelative:.00001,charge:.001,temperature:.1,ablator:.0001};
export function compareGolden(expected,actual,{mode='trajectory',limits=tolerances}={}){
 const failures=[];let maxRatio=0;
 const finite=(v,path)=>{if(typeof v==='number'&&!Number.isFinite(v))failures.push({path,reason:'nonfinite value'});else if(v&&typeof v==='object')for(const [k,n]of Object.entries(v))finite(n,path+'.'+k);};finite(actual,'result');
 const visit=(e,a,path)=>{
  if(typeof e==='number'){
   let allowed=0;
   if(path.includes('.position['))allowed=limits.position;
   else if(path.includes('.velocity['))allowed=limits.velocity;
   else if(path.includes('.angularVelocity['))allowed=limits.angularVelocity;
   else if(path.endsWith('.time'))allowed=path.includes('.events[')?limits.eventTime:limits.time;
   else if(path.endsWith('.fuel'))allowed=limits.fuelAbsolute+limits.fuelRelative*Math.abs(e);
   else for(const key of ['charge','temperature','ablator'])if(path.endsWith('.'+key))allowed=limits[key];
   const delta=Math.abs(a-e),ratio=allowed?delta/allowed:delta===0?0:Infinity;maxRatio=Math.max(maxRatio,ratio);
   if(!Number.isFinite(a)||delta>allowed)failures.push({path,expected:e,actual:a,delta,allowed});return;
  }
  if(path.endsWith('.quaternion')&&Array.isArray(e)&&Array.isArray(a)&&a.length===4){
   const norm=Math.hypot(...a),dot=Math.abs(e.reduce((s,v,i)=>s+v*a[i],0))/(Math.hypot(...e)*norm),angle=2*Math.acos(Math.min(1,dot));
   maxRatio=Math.max(maxRatio,angle/limits.quaternionRadians);
   if(!Number.isFinite(angle)||Math.abs(norm-1)>.0001||angle>limits.quaternionRadians)failures.push({path,angle,allowed:limits.quaternionRadians});return;
  }
  if(Array.isArray(e)){
   if(!Array.isArray(a)||e.length!==a.length){failures.push({path,expectedLength:e.length,actualLength:a?.length});return;}
   e.forEach((v,i)=>visit(v,a[i],`${path}[${i}]`));return;
  }
  if(e&&typeof e==='object'){
   if(!a||typeof a!=='object'){failures.push({path,expected:e,actual:a});return;}
   const diagnostic=mode==='impact'&&path.includes('.vessels[')?new Set(['position','velocity','quaternion','angularVelocity']):new Set();
   if(Object.keys(e).sort().join('|')!==Object.keys(a).sort().join('|'))failures.push({path,reason:'schema keys differ'});
   for(const key of Object.keys(e))if(!diagnostic.has(key))visit(e[key],a[key],path+'.'+key);return;
  }
  if(e!==a)failures.push({path,expected:e,actual:a});
 };
 visit(expected,actual,'result');return {pass:!failures.length,maxRatio,failures};
}
export function assertGolden(expected,actual,options){const result=compareGolden(expected,actual,options);assert.ok(result.pass,JSON.stringify(result.failures.slice(0,12),null,2));return result;}

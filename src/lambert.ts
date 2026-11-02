import {stumpff,keplerDrift} from './coast-orbit.js';
type Vector3=import('three').Vector3;
export interface LambertArc{departure:Vector3;arrival:Vector3}

// Single-revolution-free Lambert arc, in coordinates centred on the attracting
// body. The normal selects the direction of travel, including the long arc.
// Reject singular geometry and verify the solution by independent propagation.
export function lambertArc(from:Vector3,to:Vector3,duration:number,mu:number,normal:Vector3):LambertArc{
 if(![...from.toArray(),...to.toArray(),...normal.toArray(),duration,mu].every(Number.isFinite)||duration<=0||mu<=0||from.length()===0||to.length()===0||normal.length()===0)throw Error('遷移軌道の条件が不正です');
 const r1=from.length(),r2=to.length(),cos=Math.max(-1,Math.min(1,from.dot(to)/(r1*r2))),cross=from.clone().cross(to);
 if(cross.length()/(r1*r2)<1e-7)throw Error('一直線の遷移軌道は計算対象外です');
 const sin=Math.sqrt(1-cos*cos)*(cross.dot(normal)>=0?1:-1),a=sin*Math.sqrt(r1*r2/(1-cos)),root=Math.sqrt(mu);
 const at=(z:number)=>{const {c,s}=stumpff(z);if(c<=0)return null;const y=r1+r2+a*(z*s-1)/Math.sqrt(c);if(y<=0)return null;const t=((y/c)**1.5*s+a*Math.sqrt(y))/root;return Number.isFinite(t)&&t>=0?{t,y}:null;};
 let lo=0,hi=4*Math.PI*Math.PI-1e-6,zero=at(0);
 if(!zero||zero.t>duration){hi=0;lo=-1;for(let i=0;i<32;i++){const value=at(lo);if(!value||value.t<=duration)break;lo*=2;}}
 if(!at(hi)||at(hi)!.t<duration)throw Error('遷移時間を囲めません');
 for(let i=0;i<100;i++){const mid=(lo+hi)/2,value=at(mid);if(!value||value.t<duration)lo=mid;else hi=mid;}
 const solution=at((lo+hi)/2);if(!solution||Math.abs(solution.t-duration)>1e-7*Math.max(1,duration))throw Error('遷移時間が収束しません');
 const f=1-solution.y/r1,g=a*Math.sqrt(solution.y/mu),gdot=1-solution.y/r2;
 const departure=to.clone().addScaledVector(from,-f).divideScalar(g),arrival=to.clone().multiplyScalar(gdot).sub(from).divideScalar(g);
 const check=keplerDrift(from,departure,mu,duration);
 if(check.position.distanceTo(to)>Math.max(.01,r2*1e-8))throw Error('遷移終点の検証に失敗しました');
 return {departure,arrival};
}

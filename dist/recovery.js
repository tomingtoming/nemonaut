import * as T from 'three';
export const chuteNames={stowed:'収納',armed:'安全条件待ち',reefed:'縮帆展開',open:'全開',landed:'着地',cut:'切離し済み'};
const waitReasons=new WeakMap();
export const parachuteWaitReason=state=>waitReasons.get(state)||'';
export function parachuteBlocker({altitude,speed,vertical,density}){
 if(!(density>.03))return '大気不足';
 if(!(altitude<5000))return '高度5 km以上';
 if(!(vertical<0))return '降下待ち';
 if(!(speed<250))return '速度250 m/s以上';
 if(!(.5*density*speed*speed<35000))return '動圧過大';
 return '';
}
export function parachuteStep(state,{altitude,speed,vertical,density,landed},dt){if(state.status==='cut'){state.fraction=0;return;}if(landed&&state.fraction>0){state.status='landed';state.fraction=0;return;}const reason=state.status==='armed'?parachuteBlocker({altitude,speed,vertical,density}):'';waitReasons.set(state,reason);if(state.status==='armed'&&!reason)state.status='reefed';if(state.status==='reefed'&&altitude<1500&&speed<80)state.status='open';const target=state.status==='open'?1:state.status==='reefed'?.08:0;state.fraction+=T.MathUtils.clamp(target-state.fraction,-dt/3,dt/3);}
export function parachuteDrag(velocity,density,area,fraction,mass,dt){const speed=velocity.length();if(!speed||!fraction)return new T.Vector3();const force=Math.min(.5*density*speed*speed*area*1.5*fraction,mass*speed/(Math.max(dt,1e-6)*2));return velocity.clone().multiplyScalar(-force/speed);}

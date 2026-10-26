import {controlAxes} from './aero.js';
import {PARTS} from './catalog.js';
import {canControl} from './fleet.js';
export function partActions(f,id){
 const p=f?.parts.find(p=>p.id===id);if(!p)return [];const d=PARTS[p.type];
 return [[d.thrust,'engine','エンジン'],[d.gimbal,'gimbalEnabled','ジンバル'],[d.controlAxis,'controlEnabled','操舵面'],[d.controlAxis,'controlPitch','ピッチ'],[d.controlAxis,'controlYaw','ヨー'],[d.controlAxis,'controlRoll','ロール'],[d.reactionTorque,'reactionEnabled','リアクションホイール'],[d.steer,'steeringEnabled','車輪操舵'],[p.type==='wheel','driveEnabled','車輪駆動']].filter(([yes])=>yes).map(([,key,label])=>({key,label,on:key==='engine'?f.active.has(id):['controlPitch','controlYaw','controlRoll'].includes(key)?controlAxes(p)[key.slice(7).toLowerCase()]:p[key]!==false,globalOff:['reactionEnabled','steeringEnabled','driveEnabled'].includes(key)&&!f[key]}));
}
export function setPartAction(f,id,key,on){
 if(!f||!canControl(f)||typeof on!=='boolean'||!partActions(f,id).some(a=>a.key===key))return false;
 const p=f.parts.find(p=>p.id===id);
 if(key==='engine'){if(on){f.active.add(id);f.started=true;}else f.active.delete(id);}else p[key]=on;
 return true;
}

export function setPartThrustLimit(f,id,value){
 const p=f?.parts.find(p=>p.id===id);if(!p||!canControl(f)||!PARTS[p.type].thrust||!Number.isFinite(value)||value<0||value>1)return false;
 p.thrustLimit=value;return true;
}

export function setPartControlLimit(f,id,value){
 const p=f?.parts.find(p=>p.id===id);if(!p||!canControl(f)||!PARTS[p.type].controlAxis||!Number.isFinite(value)||value<0||value>1)return false;
 p.controlLimit=value;return true;
}

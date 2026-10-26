import {partSettings} from './part-settings.js';
import {PARTS} from './catalog.js';
import {canControl} from './fleet.js';
export function partActions(f,id){
 const p=f?.parts.find(p=>p.id===id);if(!p)return [];const d=PARTS[p.type];
 return [...(d.thrust?[{key:'engine',label:'エンジン',on:f.active.has(id),globalOff:false}]:[]),...partSettings(p).filter(s=>s.type==='boolean').map(s=>({key:s.key,label:s.label,on:s.value,globalOff:['reactionEnabled','steeringEnabled','driveEnabled'].includes(s.key)&&!f[s.key]}))];
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

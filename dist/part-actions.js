import {engineMedium} from './engine-medium.js';
import {fuelNetworks} from './resources.js';
import {partSettings} from './part-settings.js';
import {PARTS} from './catalog.js';
import {canControl} from './fleet.js';
export function partActions(f,id){
 const p=f?.parts.find(p=>p.id===id);if(!p)return [];const d=PARTS[p.type];
 return [...(p.type==='probe'?[{key:'observation',label:'地表観測 · 0.1 EC/s',on:f.observations.get(id)?.enabled??false,globalOff:false}]:[]),...(d.thrust?[{key:'engine',label:'エンジン',on:f.active.has(id),globalOff:false}]:[]),...partSettings(p).filter(s=>s.type==='boolean').map(s=>({key:s.key,label:s.label,on:s.value,globalOff:['reactionEnabled','steeringEnabled','driveEnabled'].includes(s.key)&&!f[s.key]}))];
}
export function setPartAction(f,id,key,on){
 if(!f||!canControl(f)||typeof on!=='boolean'||!partActions(f,id).some(a=>a.key===key))return false;
 const p=f.parts.find(p=>p.id===id);
 if(key==='observation'){if(on&&f.thermal.get(id)?.failed)return false;f.observations.get(id).enabled=on;return true;}
 if(key==='engine'){if(on&&f.thermal.get(id)?.failed)return false;if(on){f.active.add(id);f.started=true;}else f.active.delete(id);}else p[key]=on;
 if(key==='fuelCrossfeed'||key==='fuelEnabled')f.networks=fuelNetworks(f.parts);
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

export function parachuteActions(f,id){
 const p=f?.parts.find(p=>p.id===id),s=f?.chutes.get(id);
 if(!p||!PARTS[p.type].parachute||!s)return [];
 return [{key:'arm',label:'開傘待機',enabled:s.status==='stowed'},
 {key:'disarm',label:'待機解除',enabled:s.status==='armed'},
 {key:'cut',label:'パラシュートを切離す',enabled:['reefed','open'].includes(s.status)}]
 .map(a=>({...a,enabled:a.enabled&&canControl(f)&&!f.thermal.get(id)?.failed}));
}
export function setParachuteAction(f,id,key){
 if(!parachuteActions(f,id).some(a=>a.key===key&&a.enabled))return false;
 const s=f.chutes.get(id);s.status={arm:'armed',disarm:'stowed',cut:'cut'}[key];s.fraction=0;return true;
}

export function engineState(f,id){
 const p=f?.parts.find(p=>p.id===id);if(!p||!PARTS[p.type].thrust)return null;
 const active=f.active.has(id),failed=!!f.thermal.get(id)?.failed,d=PARTS[p.type],medium=engineMedium(f,p);
 const tanks=f.networks.network.get(id)?.tanks||[],fuel=tanks.reduce((sum,p)=>sum+(f.fuel.get(p.id)||0),0);
 const status=failed?'損傷':!active?'停止中':f.throttle===0?'スロットル待ち':(p.thrustLimit??1)===0?'推力上限 0%':d.air&&medium.density<=0?'大気なし':d.water&&medium.submersion<=0?'水中でのみ作動':!d.water&&fuel<=0?'燃料供給なし':(f.engineThrust.get(id)||0)>0?(d.water?'推進中':'燃焼中'):'推力待ち';
 return {active,status,enabled:canControl(f)&&(!failed||active)};
}

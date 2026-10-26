import {PARTS} from './catalog.js';
import {fleet,canControl} from './fleet.js';
import {dockingStatus,dockVessels,undockVessel} from './docking.js';
export function portWindowState(f,id,targetId){
 const part=f?.parts.find(p=>p.id===id);if(!part||!PARTS[part.type].docking)return null;
 const partner=f.parts.find(p=>p.id===part.dockPartner),targets=partner?[]:fleet(f).filter(v=>v!==f&&!v.crashed).flatMap(v=>v.parts.filter(p=>PARTS[p.type].docking&&!p.dockPartner).map(p=>({id:p.id,name:(v.vesselName||'名称未設定の機体')+' · ポート '+(v.parts.indexOf(p)+1),vessel:v})));
 const target=targets.find(p=>p.id===targetId),status=target?dockingStatus(f,id,target.vessel,target.id):null;
 return {partner,targets,status,canUndock:!!partner&&canControl(f),canDock:!!status?.ready&&canControl(f)};
}
export function operatePort(f,id,action,targetId){
 const state=portWindowState(f,id,targetId);
 if(action==='undock'&&state?.canUndock)return undockVessel(f,id);
 if(action==='dock'&&state?.canDock){const target=state.targets.find(p=>p.id===targetId);return dockVessels(f,target.vessel,id,targetId);}
 throw Error(state?.status?.reason||'このポートは操作できません');
}

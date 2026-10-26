import {setTarget} from './relative-navigation.js';
import {PARTS} from './catalog.js';
import {fleet,canControl} from './fleet.js';
import {dockingStatus,dockVessels,undockVessel} from './docking.js';
export function portWindowState(f,id,targetId){
 const part=f?.parts.find(p=>p.id===id);if(!part||!PARTS[part.type].docking)return null;
 const partner=f.parts.find(p=>p.id===part.dockPartner),targets=partner?[]:fleet(f).filter(v=>v!==f&&!v.crashed).flatMap(v=>v.parts.filter(p=>PARTS[p.type].docking&&!p.dockPartner).map(p=>({id:p.id,name:(v.vesselName||'名称未設定の機体')+' · ポート '+(v.parts.indexOf(p)+1),vessel:v})));
 const target=targets.find(p=>p.id===targetId),status=target?dockingStatus(f,id,target.vessel,target.id):null;
 const selected=!!target&&f.navigationTarget===target.vessel&&f.dockingPorts?.own===id&&f.dockingPorts?.target===targetId;
 return {partner,targets,status,selected,canGuide:!!target&&canControl(f),canUndock:!!partner&&canControl(f),canDock:!!status?.ready&&canControl(f)};
}
export function operatePort(f,id,action,targetId){
 const state=portWindowState(f,id,targetId);
 if(action==='undock'&&state?.canUndock)return undockVessel(f,id);
 if(action==='dock'&&state?.canDock){const target=state.targets.find(p=>p.id===targetId);return dockVessels(f,target.vessel,id,targetId);}
 throw Error(state?.status?.reason||'このポートは操作できません');
}

export function guideFromPort(f,id,targetId,{align=false}={}){
 const state=portWindowState(f,id,targetId);if(!state?.canGuide)return false;
 const target=state.targets.find(t=>t.id===targetId);
 if(!state.selected){f.portTranslationEnabled=false;if(f.sasMode==='dock'){f.sasMode='hold';f.holdQ=f.q.clone();}}
 setTarget(f,f,target.vessel);f.targetPartId=targetId;f.dockingPorts={own:id,target:targetId};
 if(align){f.sas=true;f.sasMode='dock';f.holdQ=f.q.clone();}
 return true;
}

export function setPortTranslation(f,id,targetId,on){
 const state=portWindowState(f,id,targetId);
 if(typeof on!=='boolean'||!state?.canGuide||!state.selected)return false;
 f.portTranslationEnabled=on;return true;
}

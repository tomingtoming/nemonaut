import {PARTS} from './catalog.js';
import {canControl} from './fleet.js';
import {floatingWindow} from './floating-window.js';
import {partActions,setPartAction,setPartThrustLimit} from './part-actions.js';
export function mountPartWindows(getFlight,beforeAction,highlight=()=>{}){
 const host=document.createElement('div');host.id='partWindows';document.body.append(host);const windows=new Map();let vessel=null;
 const close=id=>{highlight(null);windows.get(id)?.remove();windows.delete(id);};
 function clear(){highlight(null);for(const id of windows.keys())close(id);vessel=null;}
 function update(){const f=getFlight();if(f!==vessel){clear();return;}host.hidden=!f||!document.querySelector('#orbitOverlay').hidden;
  for(const [id,w]of windows){const p=f.parts.find(p=>p.id===id);if(!p){close(id);continue;}const d=PARTS[p.type];
   for(const a of partActions(f,id)){const row=w.content.querySelector('[data-action="'+a.key+'"]');row.checked=a.on;row.disabled=!canControl(f);row.parentElement.title=a.globalOff?'機体全体のスイッチがOFFです':'';row.parentElement.classList.toggle('globalOff',a.globalOff);row.parentElement.querySelector('small').textContent=a.globalOff?'機体全体OFF':'';}
   if(w.limit){w.limit.value=String(Math.round((p.thrustLimit??1)*100));w.limit.disabled=!canControl(f);w.limitValue.textContent=w.limit.value+'%';}
   const values=[];if(d.fuel||d.monoprop)values.push('推進剤 '+(f.fuel.get(id)||0).toFixed(1)+' / '+(d.fuel||d.monoprop)+' kg');if(d.battery)values.push('電力 '+(f.charge.get(id)||0).toFixed(1)+' / '+d.battery+' EC');if(d.thrust&&!d.water)values.push('推力 '+((f.engineThrust.get(id)||0)/1000).toFixed(1)+' kN');const heat=f.thermal.get(id);if(heat)values.push('温度 '+heat.temperature.toFixed(0)+' K');w.readings.textContent=values.join('\n');
  }
 }
 function open(id,x,y){const f=getFlight(),p=f?.parts.find(p=>p.id===id);if(!p)return;if(vessel!==f)clear();vessel=f;if(windows.has(id)){windows.get(id).front();return;}for(const [other,w]of windows)if(!w.pinned)close(other);
  const d=PARTS[p.type],w=floatingWindow(host,{title:d.name+' · '+(f.parts.indexOf(p)+1),x:x+12,y:y+12,onClose:()=>close(id)});windows.set(id,w);w.element.onpointerenter=()=>highlight(id);w.element.onpointerleave=()=>highlight(null);
  for(const a of partActions(f,id)){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.action=a.key;const state=document.createElement('small');label.append(document.createTextNode(a.label),state,input);w.content.append(label);input.onchange=()=>{if(getFlight()!==f)return;beforeAction();setPartAction(f,id,a.key,input.checked);update();};}
  if(d.thrust){const label=document.createElement('label');label.className='partThrustLimit';const name=document.createElement('span');name.textContent='推力上限';w.limitValue=document.createElement('span');w.limit=document.createElement('input');w.limit.type='range';w.limit.min=0;w.limit.max=100;w.limit.step=1;w.limit.setAttribute('aria-label','推力上限');w.limit.title='全体スロットル × この部品の推力上限';label.append(name,w.limitValue,w.limit);w.content.append(label);w.limit.oninput=()=>{if(getFlight()!==f)return;beforeAction();setPartThrustLimit(f,id,Number(w.limit.value)/100);update();};}
  w.readings=document.createElement('output');w.content.append(w.readings);update();w.clamp();
 }
 return {open,update,clear};
}

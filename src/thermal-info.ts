// Thermal panel (BACKLOG 7c, moved from app.ts unchanged): heat-shield ablator summary and the hottest parts
// of the flight in progress. No import-time side effects.
import {PARTS} from './catalog.js';
import type {Flight,FlightPart} from './core.js';
import {state} from './app-state.js';
import {$} from './ui-common.js';
function thermalState(f:Flight,id:string){const heat=f.thermal.get(id);if(!heat)throw Error('部品の熱状態が見つかりません: '+id);return heat;}
export function updateThermalInfo(){
 const heated=state.flight,current=heated?heated.parts:state.parts,shields=current.filter(p=>PARTS[p.type].heatShield),capacity=shields.reduce((n,p)=>n+(PARTS[p.type].ablator??0),0),remaining=heated?shields.reduce((n,p)=>n+thermalState(heated,p.id).ablator,0):capacity,list=$('#thermalParts','div');list.replaceChildren();
 $('#thermalSummary','p').textContent=capacity?'消耗材 '+remaining.toFixed(2)+' / '+capacity+' kg':'熱シールド未搭載';
 if(!heated)return;
 const ordered=[...current].sort((a,b)=>{const ratio=(p:FlightPart)=>thermalState(heated,p.id).temperature/(PARTS[p.type].maxTemperature||1100);return ratio(b)-ratio(a);});
 for(const p of ordered){const heat=thermalState(heated,p.id),limit=PARTS[p.type].maxTemperature||1100,row=document.createElement('div');row.className='thermalRow'+(heat.failed?' failed':heat.temperature/limit>.8?' hot':'');row.textContent=PARTS[p.type].code+' · '+heat.temperature.toFixed(0)+' / '+limit+' K'+(heat.failed?' · 熱損傷':heated.telemetry.thermal?.parts.get(p.id)?.shielded?' · 遮熱中':'');list.append(row);}
}

import {stageFuelLevels} from './stage-fuel.js';
import {stagePerformance,type ResourcePart} from './resources.js';
import {stagePlan,type StagePart} from './staging.js';
import {PARTS,type PartCatalog} from './catalog.js';
import {chuteNames,type ParachuteState} from './recovery.js';
export type StackPart=ResourcePart&StagePart;
export interface StackFlight{fuel:ReadonlyMap<string,number>;stage:number;chutes:ReadonlyMap<string,ParachuteState>;active:ReadonlySet<string>}
export interface StageStackOptions{flight?:StackFlight|null;onSelect:(id:string)=>void;onMove:(stage:number,direction:number)=>void;onPreview?:((stage:number)=>void)|null;previewStage?:number|null}
export interface SasDirectionFlight{maneuver?:unknown;dockingPorts?:unknown;navigationTarget?:unknown;sas:boolean;sasMode:string}
const lastStages=new WeakMap<Element,number>();
export function renderStageStack(host:Element,parts:readonly StackPart[],{flight,onSelect,onMove,onPreview,previewStage=null}:StageStackOptions):void{
 host.replaceChildren();const fuelLevels=stageFuelLevels(parts,flight?.fuel),performance=new Map((flight?[]:stagePerformance(parts)).map(p=>[p.stage,p]));
 for(const slot of stagePlan(parts).reverse()){
  const row=document.createElement('section');row.className='stageStackRow';
  row.classList.toggle('next',!!flight&&slot.stage===flight.stage+1);row.classList.toggle('spent',!!flight&&slot.stage<=flight.stage);
  const label=document.createElement(!flight&&onPreview?'button':'b');label.textContent=String(slot.stage).padStart(2,'0');if(!flight&&onPreview){label.className='stagePreview';label.title='段 '+slot.stage+' の分離後機体・重心・推力線を表示／解除';label.setAttribute('aria-label',label.title);label.setAttribute('aria-pressed',String(previewStage===slot.stage));label.onclick=()=>onPreview(slot.stage);}row.append(label);
  const icons=document.createElement('div');icons.className='stageStackIcons';
  for(const action of slot.actions){const p=parts.find(p=>p.id===action.id)!,button=document.createElement('button');
   const chute=action.kind==='chute'&&flight?flight.chutes.get(p.id)?.status:null;if(chute){button.dataset.chute=chute;row.classList.toggle('chuteActive',row.classList.contains('chuteActive')||['armed','reefed','open'].includes(chute));}
   const name=(chute?'パラシュート '+chuteNames[chute]:action.label)+' · '+(parts.indexOf(p)+1)+'. '+(PARTS as PartCatalog)[p.type].name;button.title=name;button.setAttribute('aria-label',name);button.disabled=!!flight;
   button.innerHTML={engine:'<svg viewBox="0 0 24 24"><path d="M9 3h6l1 5-2 3 4 8H6l4-8-2-3z"/><path d="M9 21v2m3-2v2m3-2v2"/></svg>',separate:'<svg viewBox="0 0 24 24"><path d="M4 7h16v3H4zm0 7h16v3H4z"/></svg>',chute:'<svg viewBox="0 0 24 24"><path d="M3 10a9 9 0 0 1 18 0zM3 10l9 11 9-11M12 10v11"/></svg>'}[action.kind];button.onclick=()=>onSelect(p.id);icons.append(button);
  }
  if(!slot.actions.length){const empty=document.createElement('span');empty.textContent='—';icons.append(empty);}row.append(icons);
  const fuel=fuelLevels.get(slot.stage);if(fuel){const gauge=document.createElement('div');gauge.className='stageFuel';const meter=document.createElement('meter');meter.min=0;meter.max=Math.max(1,fuel.capacity);meter.value=fuel.remaining;meter.setAttribute('aria-label','段 '+slot.stage+' の使用可能燃料');const value=document.createElement('span');value.textContent=fuel.capacity?Math.round(fuel.remaining/fuel.capacity*100)+'%':'未供給';gauge.title='使用可能燃料 '+Math.round(fuel.remaining)+' / '+fuel.capacity+' kg'+(fuel.unfed?' · 未供給 '+fuel.unfed+'基':'');gauge.classList.toggle('empty',fuel.remaining<=0);gauge.append(meter,value);row.append(gauge);row.classList.toggle('engaged',!!flight&&fuel.remaining>0&&fuel.engines.some(id=>flight.active.has(id)));}
  const perf=performance.get(slot.stage);if(perf){const readout=document.createElement('div');readout.className='stagePerformance';readout.setAttribute('aria-label','段 '+slot.stage+' の参考性能');readout.title='設定した搭載燃料で順番に燃焼・分離した参考値。重力・空気抵抗の損失は含みません。Δvは真空、TWRは母星地表重力9.81 m/s²基準。地＝海面推力、空＝真空推力。';for(const text of ['Δv '+Math.round(perf.dv)+' m/s',Math.abs(perf.seaTwr-perf.twr)>.01?'TWR 地'+perf.seaTwr.toFixed(2)+' / 空'+perf.twr.toFixed(2):'TWR '+perf.twr.toFixed(2)]){const item=document.createElement('span');item.textContent=text;readout.append(item);}row.append(readout);}
  if(!flight){const moves=document.createElement('div');moves.className='stackMoves';for(const direction of [-1,1]){const b=document.createElement('button');b.textContent=direction<0?'−':'＋';b.title='段 '+slot.stage+' を'+(direction<0?'前':'後')+'へ';b.setAttribute('aria-label',b.title);b.disabled=!slot.actions.length||slot.stage+direction<0||slot.stage+direction>9;b.onclick=()=>onMove(slot.stage,direction);moves.append(b);}row.append(moves);}
  host.append(row);
 }
 if(flight&&lastStages.get(host)!==flight.stage){host.scrollTop=host.scrollHeight;lastStages.set(host,flight.stage);}
 if(!flight)lastStages.delete(host);
}
export function mountKspLayout():void{
 const hud=document.querySelector('#flightHud')!,nav=document.querySelector('.navpanel')!,readings=document.querySelector('.hudreadings')!;
 const speed=document.querySelector('#speed')!.parentElement!;speed.classList.add('navSpeed');nav.prepend(speed);document.querySelector<HTMLCanvasElement>('#navball')!.width=180;document.querySelector<HTMLCanvasElement>('#navball')!.height=180;
 nav.append(document.querySelector('.throttle')!);const switches=document.createElement('div');switches.className='navSwitches';
 switches.append(document.querySelector('#sas')!,document.querySelector('#brake')!,document.querySelector('#precisionControl')!,document.querySelector('#rcsEnabled')!.closest('label')!);nav.append(switches);
 const modes=document.createElement('div');modes.id='sasDirections';modes.setAttribute('role','group');modes.setAttribute('aria-label','SAS向け先');const select=document.querySelector<HTMLSelectElement>('#sasMode')!;select.closest('label')!.hidden=true;
 for(const [mode,label]of [['hold','保持'],['prograde','順行'],['retrograde','逆行'],['radial','天頂'],['antiradial','天底'],['normal','軌道＋'],['antinormal','軌道−'],['maneuver','噴射'],['target','目標'],['relativeRetrograde','相対逆行'],['dock','ポート']]){const b=document.createElement('button');b.dataset.mode=mode;b.textContent=label;b.title=select.querySelector('option[value="'+mode+'"]')!.textContent;b.setAttribute('aria-label','SAS '+b.title);b.onclick=()=>{select.value=mode;select.dispatchEvent(new Event('change',{bubbles:true}));b.blur();};modes.append(b);}nav.append(modes);
 readings.classList.add('altimeter');document.querySelector('#alt')!.previousElementSibling!.textContent='高度';document.querySelector('#vspeed')!.previousElementSibling!.textContent='昇降率';
 const dock=document.createElement('div');dock.id='stageDock';const stack=document.createElement('div');stack.id='stageStack';dock.append(stack,document.querySelector('#stage')!);document.body.append(dock);
 const systems=document.createElement('details');systems.id='flightSystems';const summary=document.createElement('summary');summary.textContent='機器';systems.append(summary,document.querySelector('.flightbottom')!);hud.append(systems);
 hud.append(document.querySelector('#practiceNotice')!);
 const warpLabel=document.querySelector('#warp')!.closest('label')!;warpLabel.firstChild!.textContent='WARP ';
 const menu=document.createElement('details');menu.id='flightMenu';const menuLabel=document.createElement('summary');menuLabel.textContent='飛行';menu.append(menuLabel,document.querySelector('.hudtop')!);hud.append(menu);
}

export function updateSasDirections(f:SasDirectionFlight):void{for(const b of document.querySelectorAll<HTMLButtonElement>('#sasDirections button')){const m=b.dataset.mode;b.disabled=m==='maneuver'?!f.maneuver:m==='dock'?!f.dockingPorts:(['target','relativeRetrograde'] as (string|undefined)[]).includes(m)?!f.navigationTarget:false;b.setAttribute('aria-pressed',String(f.sas&&f.sasMode===m));}}

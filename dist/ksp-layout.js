import {stageFuelLevels} from './stage-fuel.js';
import {stagePlan} from './staging.js';
import {PARTS} from './catalog.js';
const lastStages=new WeakMap();
export function renderStageStack(host,parts,{flight,onSelect,onMove}){
 host.replaceChildren();const fuelLevels=stageFuelLevels(parts,flight?.fuel);
 for(const slot of stagePlan(parts).reverse()){
  const row=document.createElement('section');row.className='stageStackRow';
  row.classList.toggle('next',!!flight&&slot.stage===flight.stage+1);row.classList.toggle('spent',!!flight&&slot.stage<=flight.stage);
  const label=document.createElement('b');label.textContent=String(slot.stage).padStart(2,'0');row.append(label);
  const icons=document.createElement('div');icons.className='stageStackIcons';
  for(const action of slot.actions){const p=parts.find(p=>p.id===action.id),button=document.createElement('button');
   const name=action.label+' · '+(parts.indexOf(p)+1)+'. '+PARTS[p.type].name;button.title=name;button.setAttribute('aria-label',name);button.disabled=!!flight;
   button.innerHTML={engine:'<svg viewBox="0 0 24 24"><path d="M9 3h6l1 5-2 3 4 8H6l4-8-2-3z"/><path d="M9 21v2m3-2v2m3-2v2"/></svg>',separate:'<svg viewBox="0 0 24 24"><path d="M4 7h16v3H4zm0 7h16v3H4z"/></svg>',chute:'<svg viewBox="0 0 24 24"><path d="M3 10a9 9 0 0 1 18 0zM3 10l9 11 9-11M12 10v11"/></svg>'}[action.kind];button.onclick=()=>onSelect(p.id);icons.append(button);
  }
  if(!slot.actions.length){const empty=document.createElement('span');empty.textContent='—';icons.append(empty);}row.append(icons);
  const fuel=fuelLevels.get(slot.stage);if(fuel){const gauge=document.createElement('div');gauge.className='stageFuel';const meter=document.createElement('meter');meter.min=0;meter.max=Math.max(1,fuel.capacity);meter.value=fuel.remaining;meter.setAttribute('aria-label','段 '+slot.stage+' の接続燃料');const value=document.createElement('span');value.textContent=fuel.capacity?Math.round(fuel.remaining/fuel.capacity*100)+'%':'未供給';gauge.title='接続燃料 '+Math.round(fuel.remaining)+' / '+fuel.capacity+' kg'+(fuel.unfed?' · 未供給 '+fuel.unfed+'基':'');gauge.classList.toggle('empty',fuel.remaining<=0);gauge.append(meter,value);row.append(gauge);row.classList.toggle('engaged',!!flight&&fuel.remaining>0&&fuel.engines.some(id=>flight.active.has(id)));}
  if(!flight){const moves=document.createElement('div');moves.className='stackMoves';for(const direction of [-1,1]){const b=document.createElement('button');b.textContent=direction<0?'−':'＋';b.title='段 '+slot.stage+' を'+(direction<0?'前':'後')+'へ';b.setAttribute('aria-label',b.title);b.disabled=!slot.actions.length||slot.stage+direction<0||slot.stage+direction>9;b.onclick=()=>onMove(slot.stage,direction);moves.append(b);}row.append(moves);}
  host.append(row);
 }
 if(flight&&lastStages.get(host)!==flight.stage){host.scrollTop=host.scrollHeight;lastStages.set(host,flight.stage);}
 if(!flight)lastStages.delete(host);
}
export function mountKspLayout(){
 const hud=document.querySelector('#flightHud'),nav=document.querySelector('.navpanel'),readings=document.querySelector('.hudreadings');
 const speed=document.querySelector('#speed').parentElement;speed.classList.add('navSpeed');nav.prepend(speed);document.querySelector('#navball').width=180;document.querySelector('#navball').height=180;
 nav.append(document.querySelector('.throttle'));const switches=document.createElement('div');switches.className='navSwitches';
 switches.append(document.querySelector('#sas'),document.querySelector('#brake'),document.querySelector('#rcsEnabled').closest('label'));nav.append(switches);
 readings.classList.add('altimeter');document.querySelector('#alt').previousElementSibling.textContent='高度';document.querySelector('#vspeed').previousElementSibling.textContent='昇降率';
 const dock=document.createElement('div');dock.id='stageDock';const stack=document.createElement('div');stack.id='stageStack';dock.append(stack,document.querySelector('#stage'));document.body.append(dock);
 const systems=document.createElement('details');systems.id='flightSystems';const summary=document.createElement('summary');summary.textContent='機器';systems.append(summary,document.querySelector('.flightbottom'));hud.append(systems);
 hud.append(document.querySelector('#practiceNotice'));
 const warpLabel=document.querySelector('#warp').closest('label');warpLabel.firstChild.textContent='WARP ';
 const menu=document.createElement('details');menu.id='flightMenu';const menuLabel=document.createElement('summary');menuLabel.textContent='飛行';menu.append(menuLabel,document.querySelector('.hudtop'));hud.append(menu);
}

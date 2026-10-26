import {PARTS} from './catalog.js';
import {DOCK_LIMITS} from './docking.js';
import {floatingWindow} from './floating-window.js';

// Move the live controls, preserving selection, handlers and the docking latch.
export function mountDockingWindow(getFlight){
 const button=document.createElement('button');button.id='openDocking';button.textContent='ドッキング';button.setAttribute('aria-expanded','false');document.body.append(button);
 const panel=document.querySelector('#dockingPanel');
 const resource=document.createElement('p');resource.id='dockRcsResource';resource.className='muted';document.querySelector('#portPower').closest('label').after(resource);
 let open=false;
 const close=()=>{open=false;update();};
 const view=floatingWindow(document.body,{title:'ドッキング',x:innerWidth-300,y:80,onClose:close});view.element.classList.add('dockingWindow');view.element.hidden=true;view.content.append(panel);panel.open=true;
 const help=document.createElement('details'),summary=document.createElement('summary');summary.textContent='操作';help.append(summary);
 for(const small of [...panel.querySelectorAll('small:not([id])')])help.append(small);
 panel.append(help);
 const axes=document.createElement('table');axes.className='portAxes';axes.setAttribute('aria-label','目標ポート基準の横ずれと速度');axes.innerHTML='<thead><tr><th></th><th>ずれ m</th><th>速度 m/s</th></tr></thead><tbody><tr><th>右＋</th><td></td><td></td></tr><tr><th>上＋</th><td></td><td></td></tr></tbody>';
 document.querySelector('#portReadings').after(axes);const cells=axes.querySelectorAll('td');
 const conditions=document.createElement('table');conditions.className='dockConditions';conditions.setAttribute('aria-label','結合条件');
 const criteria=[['distance','面間','m',1,2],['angle','面角度','°',180/Math.PI,1],['speed','相対速度','m/s',1,2],['angularSpeed','相対回転','°/s',180/Math.PI,1]];
 const readings=criteria.map(([key,label,unit,factor,digits])=>{const row=document.createElement('tr'),name=document.createElement('th'),value=document.createElement('td');name.textContent=label;row.append(name,value);conditions.append(row);return {key,unit,factor,digits,row,value};});
 axes.after(conditions);
 view.element.addEventListener('click',e=>e.target.closest('button,input[type=checkbox]')?.blur());
 function update(){const flight=getFlight(),active=!!flight;if(flight){const blocks=flight.parts.filter(p=>PARTS[p.type].monoprop),capacity=blocks.reduce((n,p)=>n+PARTS[p.type].monoprop,0),remaining=blocks.reduce((n,p)=>n+(flight.fuel.get(p.id)||0),0),available=blocks.some(p=>p.fuelEnabled!==false&&(flight.fuel.get(p.id)||0)>0);const state=!capacity?'未搭載':remaining<=0?'燃料切れ':!available?'供給OFF':!flight.rcsEnabled?'OFF':remaining/capacity<.1?'残量少':'ON';resource.textContent='RCS '+state+' · '+remaining.toFixed(2)+' / '+capacity+' kg';resource.style.color=(!available||remaining/capacity<.1)?'var(--orange)':'';}if(!active)open=false;button.disabled=!active;button.setAttribute('aria-expanded',String(open));const mapOpen=!document.querySelector('#orbitOverlay').hidden;button.hidden=mapOpen;view.element.hidden=!active||!open||mapOpen;if(active&&open&&!mapOpen)view.clamp();}
 button.onclick=()=>{open=!open;button.blur();update();if(open){view.front();view.clamp();}};
 return {update,close,readings(guide,status){conditions.hidden=!Number.isFinite(status?.distance);if(!conditions.hidden)for(const r of readings){const pass=status[r.key]<=DOCK_LIMITS[r.key];r.value.textContent=(pass?'✓ ':'')+(status[r.key]*r.factor).toFixed(r.digits)+' / '+(DOCK_LIMITS[r.key]*r.factor).toFixed(r.digits)+' '+r.unit;r.row.classList.toggle('satisfied',pass);}axes.hidden=!guide;if(!guide)return;[guide.horizontal,guide.horizontalSpeed,guide.vertical,guide.verticalSpeed].forEach((v,i)=>{cells[i].textContent=(v>=0?'+':'')+v.toFixed(3);});}};
}

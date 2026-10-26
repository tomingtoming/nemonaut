import {floatingWindow} from './floating-window.js';

// Move the live controls, preserving selection, handlers and the docking latch.
export function mountDockingWindow(getFlight){
 const button=document.createElement('button');button.id='openDocking';button.textContent='ドッキング';button.setAttribute('aria-expanded','false');document.body.append(button);
 const panel=document.querySelector('#dockingPanel');
 let open=false;
 const close=()=>{open=false;update();};
 const view=floatingWindow(document.body,{title:'ドッキング',x:innerWidth-300,y:80,onClose:close});view.element.classList.add('dockingWindow');view.element.hidden=true;view.content.append(panel);panel.open=true;
 const help=document.createElement('details'),summary=document.createElement('summary');summary.textContent='操作';help.append(summary);
 for(const small of [...panel.querySelectorAll('small:not([id])')])help.append(small);
 panel.append(help);
 const axes=document.createElement('table');axes.className='portAxes';axes.setAttribute('aria-label','目標ポート基準の横ずれと速度');axes.innerHTML='<thead><tr><th></th><th>ずれ m</th><th>速度 m/s</th></tr></thead><tbody><tr><th>右＋</th><td></td><td></td></tr><tr><th>上＋</th><td></td><td></td></tr></tbody>';
 document.querySelector('#portReadings').after(axes);const cells=axes.querySelectorAll('td');
 view.element.addEventListener('click',e=>e.target.closest('button,input[type=checkbox]')?.blur());
 function update(){const active=!!getFlight();if(!active)open=false;button.disabled=!active;button.setAttribute('aria-expanded',String(open));const mapOpen=!document.querySelector('#orbitOverlay').hidden;button.hidden=mapOpen;view.element.hidden=!active||!open||mapOpen;}
 button.onclick=()=>{open=!open;button.blur();update();if(open){view.front();view.clamp();}};
 return {update,close,readings(guide){axes.hidden=!guide;if(!guide)return;[guide.horizontal,guide.horizontalSpeed,guide.vertical,guide.verticalSpeed].forEach((v,i)=>{cells[i].textContent=(v>=0?'+':'')+v.toFixed(3);});}};
}

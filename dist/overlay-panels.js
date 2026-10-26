const panels=new Map();
export const showInspector=()=>panels.get("inspector")(true);
// Panels float over the world; opening one never resizes the camera viewport.
const dock=document.createElement('div');dock.id='panelDock';
for(const [id,label,closed]of [['library','部品',false],['inspector','機体',true]]){
 const panel=document.getElementById(id),button=document.createElement('button');
 button.textContent=label;button.setAttribute('aria-controls',id);
 const set=open=>{document.body.classList.toggle(id+'-closed',!open);button.setAttribute('aria-expanded',String(open));panel.inert=!open;};
 panels.set(id,set);button.onclick=()=>set(button.getAttribute('aria-expanded')!=='true');set(!closed);dock.append(button);
}
document.body.append(dock);
const operations=document.createElement('details');operations.id='centerRecords';
const summary=document.createElement('summary');summary.textContent='運用';operations.append(summary);
const sidebar=document.querySelector('.centerSidebar');
for(const element of [document.getElementById('centerGuide'),document.querySelector('.centerSession'),document.getElementById('worldHistory')])operations.append(element);
sidebar.append(operations);

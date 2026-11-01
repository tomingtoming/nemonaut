import {fleet} from './fleet.js';
import {failureCaption} from './failure-events.js';
export function failureHistory(f){return f?[...new Map(fleet(f).flatMap(v=>v.failureEvents??[]).map(e=>[e.id,e])).values()].sort((a,b)=>b.time-a.time).slice(0,64):[];}
export function failureDetail(e){return `UT ${e.time.toFixed(1)} · ${failureCaption(e)} · `+(e.cause==='thermal'?`${Math.round(e.temperature)} K`:`${e.speed.toFixed(1)} m/s`);}
// New roots include restored saves: seed silently, never replay their old events.
export class FailureAudioCursor{
 constructor(){this.root=null;this.time=0;this.seen=new Set();}
 update(f,paused=false){
  const history=failureHistory(f),now=f?.universalTime??0;
  if(f!==this.root||now<this.time){this.root=f;this.time=now;this.seen=new Set(history.map(e=>e.id));return [];}
  const fresh=history.filter(e=>!this.seen.has(e.id)&&e.time>=this.time&&e.time<=now&&now-e.time<.5);
  this.seen=new Set(history.map(e=>e.id));this.time=now;
  return paused?[]:fresh.slice(0,4);
 }
}
export function mountFailureLog(parent){
 const panel=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('ol');
 panel.id='failureLog';panel.hidden=true;panel.append(summary,list);parent.append(panel);let key='';
 return {update(f){const events=failureHistory(f),next=events.map(e=>e.id).join('|');panel.hidden=!events.length;if(next===key)return;key=next;summary.textContent=`損傷記録 · ${events.length}`;list.replaceChildren(...events.map(e=>{const row=document.createElement('li');row.textContent=failureDetail(e);return row;}));}};
}

// Both navigation and autopilot read the same selected arrival direction.
export type RunwayEnd='09'|'27';
export interface RunwayFlight{runwayEnd?:string}
export interface RunwaySelection{readonly end:RunwayEnd;bind(next:RunwayFlight|null|undefined):void;set(value:string):void;subscribe(listener:(end:string)=>void):()=>boolean}
export function runwayEnd(value:string='09'):RunwayEnd{
 if(!isRunwayEnd(value))throw Error('Unknown runway end');
 return value;
}
function isRunwayEnd(value:string):value is RunwayEnd{return value==='09'||value==='27';}
export function createRunwaySelection():RunwaySelection{
 let end:RunwayEnd='09',flight:RunwayFlight|null|undefined=null;const listeners=new Set<(end:string)=>void>();
 const publish=(value:RunwayEnd)=>{if(value===end)return;end=value;for(const listener of listeners)listener(end);};
 return {get end(){return end;},bind(next:RunwayFlight|null|undefined){
  if(next===flight)return;
  const value=runwayEnd(next?.runwayEnd);flight=next;publish(value);
 },set(value:string){
  const next=runwayEnd(value);if(flight)flight.runwayEnd=next;publish(next);
 },subscribe(listener:(end:string)=>void){listeners.add(listener);return ()=>listeners.delete(listener);}};
}
export const runwaySelection=createRunwaySelection();
export function runwaySelector(root:Document,selection:RunwaySelection=runwaySelection):HTMLSelectElement{
 const select=root.createElement('select');select.setAttribute('aria-label','着陸方向');
 for(const [value,label]of [['09','09 · 東向き'],['27','27 · 西向き']]){
  const option=root.createElement('option');option.value=value;option.textContent=label;select.append(option);
 }
 select.value=selection.end;select.onchange=()=>selection.set(select.value);return select;
}

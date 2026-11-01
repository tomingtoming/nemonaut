// Both navigation and autopilot read the same selected arrival direction.
export function runwayEnd(value='09'){
 if(!['09','27'].includes(value))throw Error('Unknown runway end');
 return value;
}
export function createRunwaySelection(){
 let end='09',flight=null;const listeners=new Set<(end:string)=>void>();
 const publish=value=>{if(value===end)return;end=value;for(const listener of listeners)listener(end);};
 return {get end(){return end;},bind(next){
  if(next===flight)return;
  const value=runwayEnd(next?.runwayEnd);flight=next;publish(value);
 },set(value){
  value=runwayEnd(value);if(flight)flight.runwayEnd=value;publish(value);
 },subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);}};
}
export const runwaySelection=createRunwaySelection();
export function runwaySelector(root,selection=runwaySelection){
 const select=root.createElement('select');select.setAttribute('aria-label','着陸方向');
 for(const [value,label]of [['09','09 · 東向き'],['27','27 · 西向き']]){
  const option=root.createElement('option');option.value=value;option.textContent=label;select.append(option);
 }
 select.value=selection.end;select.onchange=()=>selection.set(select.value);return select;
}

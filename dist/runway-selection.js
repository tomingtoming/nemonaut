// Both navigation and autopilot read the same selected arrival direction.
export function createRunwaySelection(){
 let end='09';const listeners=new Set();
 return {get end(){return end;},set(value){
  if(!['09','27'].includes(value))throw Error('Unknown runway end');
  if(value===end)return;end=value;for(const listener of listeners)listener(end);
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

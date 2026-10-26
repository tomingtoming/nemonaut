export function mountFlightPause(root,{keys,clock,onChange}){
 let paused=false;
 const button=root.createElement('button');button.id='flightPause';button.type='button';
 root.querySelector('#warp').closest('label').after(button);
 function refresh(){
  button.textContent=paused?'▶ P':'Ⅱ P';
  button.setAttribute('aria-label',paused?'飛行を再開 P':'飛行を一時停止 P');
  button.setAttribute('aria-pressed',String(paused));
  button.title=paused?'全機体を再開（1倍速）':'全機体の時刻・物理・資源を停止';
  root.querySelector('#warp').disabled=paused;
  if(paused)root.querySelector('#warpStatus').textContent='一時停止 · Pで再開';
 }
 function set(value){
  paused=!!value;keys.clear();clock.reset();root.querySelector('#warp').value='1';
  root.querySelector('#warpStatus').textContent=paused?'一時停止 · Pで再開':'通常速度 · 1倍';
  refresh();onChange?.();
 }
 button.onclick=()=>{set(!paused);button.blur();};refresh();
 return {get paused(){return paused;},set,refresh,toggle(){set(!paused);}};
}

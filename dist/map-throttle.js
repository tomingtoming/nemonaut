import {canControl} from './fleet.js';
import {formatDuration} from './orbit-plan.js';
export const maneuverCountdown=seconds=>seconds<10?seconds.toFixed(1)+' 秒':formatDuration(seconds);
export function mountMapThrottle(cutoff,getFlight,onSet){
 const row=document.createElement('div');row.id='mapThrottle';row.setAttribute('role','group');row.setAttribute('aria-label','マップの推力');
 cutoff.before(row);row.append(cutoff);
 const buttons=[1,10,100].map(value=>{const button=document.createElement('button');button.textContent=value+'%';button.setAttribute('aria-label','推力 '+value+'%');button.onclick=()=>{const f=getFlight();if(f&&canControl(f))onSet(value/100);};row.append(button);return [button,value];});
 function update(){const f=getFlight();for(const [button,value] of buttons){button.disabled=!f||!canControl(f);button.setAttribute('aria-pressed',String(!!f&&Math.abs(f.throttle-value/100)<1e-6));}}
 update();return {update};
}

// @ts-nocheck: typing debt (BACKLOG 4d). Remove this line once tsc passes the file.
import {captureBurnEstimate} from './lunar-capture.js';
import {canControl} from './fleet.js';
import {formatDuration} from './orbit-plan.js';
export const maneuverCountdown=seconds=>seconds<10?seconds.toFixed(1)+' 秒':formatDuration(seconds);
export function mountMapThrottle(cutoff,getFlight,onSet){
 const row=document.createElement('div');row.id='mapThrottle';row.setAttribute('role','group');row.setAttribute('aria-label','マップの推力');
 cutoff.before(row);row.append(cutoff);
 const buttons=[1,10,100].map(value=>{const button=document.createElement('button');button.textContent=value+'%';button.setAttribute('aria-label','推力 '+value+'%');button.onclick=()=>{const f=getFlight();if(f&&canControl(f))onSet(value/100);};row.append(button);return [button,value];});
 function update(deltaV=null){const f=getFlight();let estimate=null;try{if(f&&deltaV>0)estimate=captureBurnEstimate(f,deltaV);}catch{}for(const [button,value] of buttons){const duration=estimate?.duration/(value/100),long=estimate&&Number.isFinite(f.orbit?.period)&&duration>f.orbit.period*.05;const planned=!!f?.maneuver&&!f.maneuver.complete&&f.maneuver.plannedThrottle===value/100;button.dataset.planned=String(planned);button.textContent=value+'%'+(planned?'［計画］':'')+(estimate?' · '+(estimate.enough?(duration<60?duration.toFixed(1)+'秒':formatDuration(duration)):'燃料不足')+(long?' ⚠':''):'');button.title=estimate?(estimate.enough?'残りΔvをこの推力で噴射する真空での概算。姿勢ずれ・重力・段切替は含みません。'+(long?' 長時間噴射：瞬間噴射の軌道予測から大きくずれる可能性があります。':''):'現在の点火段の燃料では残りΔvに届きません。'):'点火済みのロケットエンジンと計画があると噴射時間を表示します';button.disabled=!f||!canControl(f);button.setAttribute('aria-pressed',String(!!f&&Math.abs(f.throttle-value/100)<1e-6));}}
 update();return {update};
}

import {PARTS} from './catalog.js';
import {canControl} from './fleet.js';

const commands=['stage','throttle','ballast','trim','sas','brake','sasMode','reactionEnabled','steeringEnabled','driveEnabled','rcsEnabled','armChutes','autoReturn','autoLaunch'];

// Availability belongs to the current vessel, including after separation.
// Keep stored switch settings even when their equipment is absent.
export function updateFlightControls(root,flight){
 if(!flight)return;
 const controllable=canControl(flight),parts=flight.parts;
 for(const id of commands)root.querySelector('#'+id).disabled=!controllable;
 for(const [key,available] of [
  ['rcsEnabled',parts.some(p=>PARTS[p.type].rcsThrust)],
  ['reactionEnabled',parts.some(p=>PARTS[p.type].reactionTorque)],
  ['steeringEnabled',parts.some(p=>PARTS[p.type].steer)],
  ['driveEnabled',parts.some(p=>p.type==='wheel')]
 ]){
  const input=root.querySelector('#'+key);
  input.checked=flight[key];
  input.disabled=!controllable||!available;
  input.parentElement.hidden=!available;
 }
 root.querySelector('#ballastControl').hidden=!parts.some(p=>PARTS[p.type].ballast);
}

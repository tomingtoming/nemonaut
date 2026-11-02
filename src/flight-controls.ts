import {PARTS,type PartCatalog} from './catalog.js';
import {canControl,type ControllableVessel} from './fleet.js';

const commands=['stage','throttle','ballast','trim','sas','brake','sasMode','reactionEnabled','steeringEnabled','driveEnabled','rcsEnabled','armChutes','autoReturn','autoLaunch'];

// Availability belongs to the current vessel, including after separation.
// Keep stored switch settings even when their equipment is absent.
/** The flight fields the control bar reflects. */
export interface FlightControlsVessel extends ControllableVessel{rcsEnabled:boolean;reactionEnabled:boolean;steeringEnabled:boolean;driveEnabled:boolean}
export function updateFlightControls(root:ParentNode,flight:FlightControlsVessel|null|undefined):void{
 if(!flight)return;
 const controllable=canControl(flight),parts=flight.parts;
 for(const id of commands)root.querySelector<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('#'+id)!.disabled=!controllable;
 for(const [key,available] of [
  ['rcsEnabled',parts.some(p=>(PARTS as PartCatalog)[p.type].rcsThrust)],
  ['reactionEnabled',parts.some(p=>(PARTS as PartCatalog)[p.type].reactionTorque)],
  ['steeringEnabled',parts.some(p=>(PARTS as PartCatalog)[p.type].steer)],
  ['driveEnabled',parts.some(p=>p.type==='wheel')]
 ] as const){
  const input=root.querySelector<HTMLInputElement>('#'+key)!;
  input.checked=flight[key];
  input.disabled=!controllable||!available;
  input.parentElement!.hidden=!available;
 }
 root.querySelector<HTMLElement>('#ballastControl')!.hidden=!parts.some(p=>(PARTS as PartCatalog)[p.type].ballast);
}

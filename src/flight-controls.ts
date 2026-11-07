import {armChutes, toggleRcs} from './flight-keyboard.js';
import {equipmentSwitches} from './part-settings.js';
import {PARTS} from './catalog.js';
import {canControl, type ControllableVessel} from './fleet.js';
import {element} from './dom.js';
import {hasRetractableGear} from './landing-gear.js';

const commands = [
  ['stage', 'button'],
  ['throttle', 'input'],
  ['ballast', 'input'],
  ['trim', 'input'],
  ['sas', 'button'],
  ['brake', 'button'],
  ['gear', 'button'],
  ['sasMode', 'select'],
  ['reactionEnabled', 'input'],
  ['steeringEnabled', 'input'],
  ['driveEnabled', 'input'],
  [toggleRcs.input, 'input'],
  [armChutes.button, 'button'],
  ['autoReturn', 'button'],
  ['autoLaunch', 'button']
] as const;

// Availability belongs to the current vessel, including after separation.
// Keep stored switch settings even when their equipment is absent.
/** The flight fields the control bar reflects. */
export interface FlightControlsVessel extends ControllableVessel {
  rcsEnabled: boolean;
  reactionEnabled: boolean;
  steeringEnabled: boolean;
  driveEnabled: boolean;
  gearDeployed: boolean;
}
export function showBrakeState(button: HTMLButtonElement, engaged: boolean): void {
  button.textContent = engaged ? 'BRAKE ON' : 'BRAKE OFF';
  button.classList.toggle('active', engaged);
  button.setAttribute('aria-pressed', String(engaged));
}
export function updateFlightControls(
  root: ParentNode,
  flight: FlightControlsVessel | null | undefined
): void {
  if (!flight) return;
  const controllable = canControl(flight),
    parts = flight.parts;
  for (const [id, tag] of commands) element(root, '#' + id, tag).disabled = !controllable;
  for (const [key, available] of [
    [toggleRcs.input, parts.some(p => PARTS[p.type][toggleRcs.capability])],
    ...equipmentSwitches.map(
      ({key, capability}) => [key, parts.some(p => PARTS[p.type][capability])] as const
    )
  ] as const) {
    const input = element(root, '#' + key, 'input');
    input.checked = flight[key];
    input.disabled = !controllable || !available;
    const label = input.parentElement;
    if (!label) throw Error('画面要素 #' + key + ' の親要素がありません');
    label.hidden = !available;
  }
  const chute = element(root, '#' + armChutes.button, 'button');
  chute.hidden = !parts.some(p => PARTS[p.type][armChutes.capability]);
  chute.disabled = !controllable || chute.hidden;
  element(root, '#ballastControl', 'label').hidden = !parts.some(p => PARTS[p.type].ballast);
  // The gear switch (BACKLOG 9c) shows only on a vessel with retractable gear, lit while the gear is down.
  const gear = element(root, '#gear', 'button');
  gear.hidden = !hasRetractableGear(parts);
  gear.disabled = !controllable || gear.hidden;
  gear.className = flight.gearDeployed ? 'active' : '';
  gear.textContent = flight.gearDeployed ? 'GEAR DOWN' : 'GEAR UP';
}

// Flight control handlers: the control toggles, parachutes, the
// demonstration autopilots, navigation frame and SAS mode, stage, throttle, ballast, SAS, brake, precision
// control and the lunar transfer guide buttons. app.ts calls wireFlightControls at the original place of the
// first of them; each handler is the only one of its element and event, so assigning them together keeps
// behaviour. No import-time side effects.
import {setNavigationFrame, updateNavigationFrame} from './navigation-frame.js';
import {TARGET_MODES} from './relative-navigation.js';
import {canControl} from './fleet.js';
import {ReturnPilot} from './return-pilot.js';
import {LaunchPilot} from './launch-pilot.js';
import {state} from './app-state.js';
import {$, blurActive, notify} from './ui-common.js';
import {stage} from './flight-lifecycle.js';
import {updateNavigation, updateTransferGuide} from './flight-hud.js';
import {setGear} from './landing-gear.js';
import {flapControl, armChutes} from './flight-keyboard.js';
import {showBrakeState, updateFlightControls} from './flight-controls.js';
export function wireFlightControls() {
  for (const key of ['reactionEnabled', 'steeringEnabled', 'driveEnabled', 'rcsEnabled'] as const)
    $('#' + key, 'input').onchange = () => {
      const input = $('#' + key, 'input');
      if (state.flight) state.flight[key] = input.checked;
      input.blur();
    };
  $('#' + armChutes.button, 'button').onclick = () => {
    state.flight?.armParachutes();
    blurActive();
  };
  $('#autoReturn', 'button').onclick = () => {
    if (!state.flight) return;
    if ((state.flight.orbit?.altitude || 0) < 70000) {
      notify('帰還実演は高度70 km以上で開始してください');
      return;
    }
    state.launchPilot = new ReturnPilot();
    $('#autoLaunch', 'button').textContent = '自動実演を解除';
    blurActive();
  };
  $('#navigationFrame', 'button').onclick = () => {
    if (!state.flight) return;
    state.launchPilot = null;
    $('#autoLaunch', 'button').textContent = '自動軌道投入（見本用）';
    state.flight.navigationAuto = false;
    setNavigationFrame(state.flight, state.flight.navigationFrame === 'surface' ? 'orbit' : 'surface');
    updateNavigation();
    blurActive();
  };
  $('#sasMode', 'select').onchange = () => {
    const sasMode = $('#sasMode', 'select');
    if (!state.flight) return;
    state.launchPilot = null;
    $('#autoLaunch', 'button').textContent = '自動軌道投入（見本用）';
    state.flight.sasMode =
      (sasMode.value === 'maneuver' && !state.flight.maneuver) ||
      (TARGET_MODES.includes(sasMode.value) && !state.flight.navigationTarget) ||
      (sasMode.value === 'dock' && !state.flight.dockingPorts)
        ? 'hold'
        : sasMode.value;
    state.flight.holdQ = state.flight.q.clone();
    state.flight.sas = true;
    $('#sas', 'button').textContent = 'SAS ON';
    $('#sas', 'button').classList.add('active');
    sasMode.blur();
  };
  $('#autoLaunch', 'button').onclick = () => {
    if (!state.flight) return;
    if (state.launchPilot) {
      state.launchPilot = null;
      state.flight.throttle = 0;
      $('#autoLaunch', 'button').textContent = '自動軌道投入（見本用）';
    } else {
      state.launchPilot = new LaunchPilot();
      $('#autoLaunch', 'button').textContent = '自動実演を解除';
    }
    blurActive();
  };
  $('#stage', 'button').onclick = stage;
  $('#throttle', 'input').oninput = () => {
    state.launchPilot = null;
    $('#autoLaunch', 'button').textContent = '自動軌道投入（見本用）';
    if (state.flight) {
      state.flight.throttle = +$('#throttle', 'input').value / 100;
      $('#throttleVal', 'b').textContent = Math.round(state.flight.throttle * 100) + '%';
    }
  };
  $('#ballast', 'input').oninput = () => {
    if (state.flight) state.flight.ballast = +$('#ballast', 'input').value / 100;
  };
  $('#sas', 'button').onclick = () => {
    if (!state.flight) return;
    state.flight.sas = !state.flight.sas;
    $('#sas', 'button').classList.toggle('active', state.flight.sas);
    $('#sas', 'button').textContent = 'SAS ' + (state.flight.sas ? 'ON' : 'OFF');
  };
  $('#brake', 'button').onclick = () => {
    if (!state.flight) return;
    state.flight.brake = !state.flight.brake;
    showBrakeState($('#brake', 'button'), state.flight.brake);
  };
  // Flaps step through four stages; the flap key presses this button.
  $('#' + flapControl.button, 'button').onclick = () => {
    const f = state.flight;
    if (!f || !canControl(f)) return;
    f.flapStage = (f.flapStage + 1) % 4;
    updateFlightControls(document, f);
    blurActive();
  };
  // Gear up / down: G and the touch 「ギア」 button press this button.
  $('#gear', 'button').onclick = () => {
    const f = state.flight;
    if (!f || !canControl(f)) return;
    if (setGear(f, !f.gearDeployed) === 'refused') notify('接地中はギアを格納できません');
    updateFlightControls(document, f);
    $('#gear', 'button').blur();
  };
  $('#precisionControl', 'button').onclick = () => {
    const button = $('#precisionControl', 'button'),
      on = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(on));
    button.textContent = on ? '精密操縦' : '通常操縦';
    button.classList.toggle('active', on);
    button.blur();
  };
  $('#navigationAuto', 'button').onclick = () => {
    if (!state.flight) return;
    state.launchPilot = null;
    $('#autoLaunch', 'button').textContent = '自動軌道投入（見本用）';
    state.flight.navigationAuto = !state.flight.navigationAuto;
    updateNavigationFrame(state.flight, {reset: true});
    updateNavigation();
    blurActive();
  };
  $('#transferIgnite', 'button').onclick = () => {
    if (!state.flight || !canControl(state.flight) || state.flight.crashed) return;
    if (state.flight.stage < 0) stage();
    state.flight.throttle = 1;
    $('#throttle', 'input').value = '100';
    updateTransferGuide();
  };
  $('#transferCutoff', 'button').onclick = () => {
    if (!state.flight) return;
    state.flight.throttle = 0;
    $('#throttle', 'input').value = '0';
    updateTransferGuide();
  };
  $('#transferFine', 'button').onclick = () => {
    if (!state.flight || !canControl(state.flight) || state.flight.crashed) return;
    state.flight.throttle = 0.1;
    $('#throttle', 'input').value = '10';
    updateTransferGuide();
  };
}

// Flight and design panels: mounting of the part windows and of the
// flight panels with their callbacks, in the original order (the panel DOM chain capture → descent → flight
// layout → descent window → ascent → departure, return depends on it). app.ts calls mountPartWindowPanels and
// mountFlightPanels at their original places; other modules read the handles through the getters. Calls up
// into app.ts through app-hooks. No import-time side effects.
import {mountManeuverPanel} from './maneuver-panel.js';
import {mountOrbitalAscent} from './orbital-ascent-panel.js';
import {mountCruisePanel} from './cruise-panel.js';
import {mountRunwayPanel} from './runway-panel.js';
import {mountFlightPause} from './flight-pause.js';
import {mountDockingWindow} from './docking-window.js';
import {mountDeliveryPanel} from './delivery-panel.js';
import {mountBuoyancyPanel} from './buoyancy-panel.js';
import {mountDesignPartWindows} from './design-part-windows.js';
import {mountPartWindows} from './part-windows.js';
import {frameTrackedVessel} from './camera-up.js';
import {updateFlightControls} from './flight-controls.js';
import {mountStageVisibility} from './stage-visibility.js';
import {mountDesignDiagnostics} from './design-diagnostics-panel.js';
import {mountDeparturePanel} from './departure-panel.js';
import {mountReturnPanel} from './return-panel.js';
import {mountAscentPanel} from './ascent-panel.js';
import {mountFlightLayout} from './flight-layout.js';
import {mountDescentPanel} from './descent-panel.js';
import {mountCapturePanel} from './capture-panel.js';
import {selectWorldVessel} from './world-operations.js';
import {fleet, canControl} from './fleet.js';
import {bodyUp} from './celestial.js';
import type {ThrustOverlay} from './thrust-overlay.js';
import {state} from './app-state.js';
import {hooks} from './app-hooks.js';
import {$, errorMessage, notify} from './ui-common.js';
import {vesselCenter} from './current-flight.js';
import {sceneCore, editorMarkers, selectionOverlays, objects, flightFocus} from './scene.js';
import {applySetting, select} from './workshop-select.js';
import {cancelPlacement} from './workshop-place.js';
import {mountOrbitTrajectory} from './orbit-map-ui.js';
import {keys, physicsClock} from './flight-shared.js';
export type PartWindowPanels = {
  partWindows: ReturnType<typeof mountPartWindows>;
  designPartWindows: ReturnType<typeof mountDesignPartWindows>;
};
export type FlightPanels = {
  capturePanel: ReturnType<typeof mountCapturePanel>;
  descentPanel: ReturnType<typeof mountDescentPanel>;
  runwayPanel: ReturnType<typeof mountRunwayPanel>;
  maneuverPanel: ReturnType<typeof mountManeuverPanel>;
  orbitalPanel: ReturnType<typeof mountOrbitalAscent>;
  cruisePanel: ReturnType<typeof mountCruisePanel>;
  flightPause: ReturnType<typeof mountFlightPause>;
  dockingWindow: ReturnType<typeof mountDockingWindow>;
  ascentPanel: ReturnType<typeof mountAscentPanel>;
  departurePanel: ReturnType<typeof mountDeparturePanel>;
  stageVisibility: ReturnType<typeof mountStageVisibility>;
  deliveryPanel: ReturnType<typeof mountDeliveryPanel>;
  buoyancyPanel: ReturnType<typeof mountBuoyancyPanel>;
  designDiagnostics: ReturnType<typeof mountDesignDiagnostics>;
  returnPanel: ReturnType<typeof mountReturnPanel>;
  trajectoryPanel: ReturnType<typeof mountOrbitTrajectory>;
};
let windows: PartWindowPanels | null = null,
  mounted: FlightPanels | null = null;
export function partWindowPanels(): PartWindowPanels {
  if (!windows) throw Error('部品ウィンドウがまだ作られていません');
  return windows;
}
export function flightPanels(): FlightPanels {
  if (!mounted) throw Error('飛行パネルがまだ作られていません');
  return mounted;
}
export function mountPartWindowPanels(): PartWindowPanels {
  const {partHover} = selectionOverlays();
  const partWindows = mountPartWindows(
    () => state.flight,
    () => {
      const {maneuverPanel, orbitalPanel} = flightPanels();
      maneuverPanel.stop();
      orbitalPanel.stop();
      keys.clear();
      state.launchPilot = null;
      $('#warp', 'select').value = '1';
      physicsClock.reset();
      $('#warpStatus', 'small').textContent = '通常速度へ：部品操作';
    },
    id => {
      const object = id && objects.get(id);
      partHover.visible = !!object;
      if (object) partHover.setFromObject(object);
    },
    (next, message) => {
      hooks.refreshDockedFlight(next);
      if (message) notify(message);
    }
  );
  const designPartWindows = mountDesignPartWindows(
    () => (!state.flight && !state.atCenter ? state.parts : null),
    (id, key, value, linked) => applySetting(key, value, id, linked),
    id => {
      const object = id && objects.get(id);
      partHover.visible = !!object;
      if (object) partHover.setFromObject(object);
    }
  );
  windows = {partWindows, designPartWindows};
  return windows;
}
/** Mounts the flight panels in their original order; the thrust overlay is created by app.ts with the scene. */
export function mountFlightPanels(thrustOverlay: ThrustOverlay): FlightPanels {
  const {scene, controls} = sceneCore(),
    {comMarker} = editorMarkers();
  const capturePanel = mountCapturePanel(
    $('#transferPanel', 'section'),
    () => state.flight,
    message => {
      hooks.syncFlightControls();
      notify(message);
    }
  );
  const descentPanel = mountDescentPanel(
    $('#capturePanel', 'section'),
    () => state.flight,
    () => hooks.syncFlightControls()
  );
  mountFlightLayout();
  descentPanel.mountWindow();
  const runwayPanel = mountRunwayPanel(document, () => ({flight: state.flight, atCenter: state.atCenter}));
  const maneuverPanel = mountManeuverPanel(
    document,
    () => ({flight: state.flight, atCenter: state.atCenter}),
    {
      sync: () => {
        if (state.flight) hooks.syncFlightControls();
      },
      claim: () => {
        orbitalPanel.stop();
        cruisePanel.stop();
        state.launchPilot = null;
        keys.clear();
        $('#warp', 'select').value = '1';
        physicsClock.reset();
        $('#warpStatus', 'small').textContent = flightPause.paused
          ? '一時停止 · Pで再開'
          : '通常速度へ：自動噴射を開始';
      }
    }
  );
  const orbitalPanel = mountOrbitalAscent(
    document,
    () => ({flight: state.flight, atCenter: state.atCenter}),
    {
      sync: () => {
        if (state.flight) hooks.syncFlightControls();
      },
      onRemoved: id => {
        const object = objects.get(id);
        if (object) object.visible = false;
      },
      claim: () => {
        maneuverPanel.stop();
        cruisePanel.stop();
        state.launchPilot = null;
        keys.clear();
        $('#warp', 'select').value = '1';
        physicsClock.reset();
        $('#warpStatus', 'small').textContent = flightPause.paused
          ? '一時停止 · Pで再開'
          : '通常速度へ：自動投入を開始';
      }
    }
  );
  const cruisePanel = mountCruisePanel(document, () => ({flight: state.flight, atCenter: state.atCenter}), {
    sync: () => hooks.syncFlightControls(),
    claim: () => {
      maneuverPanel.stop();
      orbitalPanel.stop();
      state.launchPilot = null;
      $('#autoLaunch', 'button').textContent = '自動軌道投入（見本用）';
      $('#warp', 'select').value = '1';
      physicsClock.reset();
      $('#warpStatus', 'small').textContent = flightPause.paused
        ? '一時停止 · Pで再開'
        : '通常速度へ：自動操縦を開始';
    }
  });
  const flightPause = mountFlightPause(document, {
    keys,
    clock: physicsClock,
    onChange: () => {
      if (state.flight) updateFlightControls(document, state.flight);
    }
  });
  const dockingWindow = mountDockingWindow(() => state.flight);
  const ascentPanel = mountAscentPanel(
    $('#descentPanel', 'section'),
    () => state.flight,
    () => hooks.syncFlightControls()
  );
  const departurePanel = mountDeparturePanel(
    $('#ascentPanel', 'details'),
    () => state.flight,
    message => {
      hooks.syncFlightControls();
      if (message) notify(message);
    }
  );
  const stageVisibility = mountStageVisibility(() => objects);
  const deliveryPanel = mountDeliveryPanel(
    document,
    () => ({
      flight: state.flight,
      world: state.parkedWorld,
      history: state.parkedWorld?.history ?? [],
      practice: !!state.practiceSession,
      atCenter: state.atCenter
    }),
    notify,
    probeId => {
      try {
        if (state.practiceSession) return;
        if (!state.flight) {
          const world = state.parkedWorld,
            target = world?.vessels.find(v => v.parts.some(p => p.id === probeId));
          if (!world || !target) throw Error('観測機が見つかりません');
          hooks.resumeFromCenter(
            selectWorldVessel(world, target.vesselId, {
              observe: !canControl({parts: target.parts, crashed: target.state.crashed})
            })
          );
        } else {
          const target = fleet(state.flight).find(v => v.parts.some(p => p.id === probeId));
          if (!target) throw Error('観測機が見つかりません');
          if (canControl(target)) {
            hooks.switchVessel(target);
          } else {
            state.trackedDebris = target;
            const focus = vesselCenter(target);
            frameTrackedVessel(controls, focus, bodyUp(focus, state.flight.universalTime));
            flightFocus.copy(focus);
            hooks.updateDebrisList();
          }
        }
      } catch (error) {
        notify(errorMessage(error));
      }
    }
  );
  const buoyancyPanel = mountBuoyancyPanel(
    document,
    scene,
    () => ({parts: state.parts, flight: state.flight, atCenter: state.atCenter}),
    comMarker
  );
  const designDiagnostics = mountDesignDiagnostics(
    $('#checks', 'div'),
    () => ({parts: state.parts, flight: state.flight}),
    id => {
      cancelPlacement();
      select(id);
      $('#selection', 'div').scrollIntoView({block: 'nearest'});
    },
    balance => thrustOverlay.update(balance),
    ids => stageVisibility.update(ids)
  );
  const returnPanel = mountReturnPanel(
    $('#ascentPanel', 'details'),
    () => state.flight,
    message => {
      hooks.syncFlightControls();
      if (message) notify(message);
    },
    {isPractice: () => !!state.practiceSession}
  );
  const trajectoryPanel = mountOrbitTrajectory();
  mounted = {
    capturePanel,
    descentPanel,
    runwayPanel,
    maneuverPanel,
    orbitalPanel,
    cruisePanel,
    flightPause,
    dockingWindow,
    ascentPanel,
    departurePanel,
    stageVisibility,
    deliveryPanel,
    buoyancyPanel,
    designDiagnostics,
    returnPanel,
    trajectoryPanel
  };
  return mounted;
}

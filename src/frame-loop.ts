import {showBrakeState} from './flight-controls.js';
import {rollKeys, throttleUp, throttleDown, keyAxis, pitchKeys, yawKeys} from './flight-keyboard.js';
import {overWater} from './surface-frame.js';
import {manualTranslation} from './flight-input.js';
// The per-frame loop: audio, failure captions, the space center
// render, throttle keys, time warp and coasting, physics stepping with the autopilots and docking, part and
// parachute visuals, debris, camera follow, the HUD and its 250 ms refresh, pause and rendering.
// No import-time side effects; app.ts calls startFrameLoop where it requested the first frame.
import * as T from 'three';
import type {FailureVisuals} from './failure-visuals.js';
import {markWreckVisual} from './failure-visuals.js';
import type {mountFailureLog} from './failure-feedback.js';
import {failureCaption} from './failure-events.js';
import {syncCargoVisual} from './cargo-geometry.js';
import {engineShrouds, syncEngineShrouds, type EngineShroudSpec} from './engine-shrouds.js';
import {updateEnginePlume} from './engine-plume.js';
import {chuteNames} from './recovery.js';
import {constrainSurfaceCamera, orbitByArrows} from './camera-up.js';
import {physicalWarpStop} from './physics-clock.js';
import {formatUniversalTime} from './universal-time.js';
import {canControl} from './fleet.js';
import {releaseBrakeForDrive} from './vessel-controls.js';
import {PARTS} from './catalog.js';
import type {FlightPart} from './core.js';
import {setText} from './dom.js';
import {navigationVelocity} from './navigation.js';
import {bodyState, bodyUp, referenceBody} from './celestial.js';
import {state} from './app-state.js';
import {$, errorMessage, notify} from './ui-common.js';
import {currentFlight, currentWorldRuntime, vesselCenter, flightCenter} from './current-flight.js';
import {sceneCore, selectionOverlays, objects, flightFocus, setCameraUp} from './scene.js';
import {assets} from './asset-loader.js';
import {updateGearVisual, updateRCSVisual, updateScrewVisual} from './part-visuals.js';
import {updateWorldGeometry, planetMaterial, patchMaterial} from './flight-world.js';
import {updateFlightChallenges} from './exploration-ui.js';
import {updatePlacementCopies} from './workshop-place.js';
import {dockingPilot} from './docking-ui.js';
import {updateOrbit} from './orbit-map-ui.js';
import {keys, physicsClock, gameAudio as flightAudio} from './flight-shared.js';
import {flightPanels} from './flight-panels.js';
import {updateInfo} from './info-hub.js';
import {parachuteVisuals, exhaust, allDebris, updateDebrisVisuals, controlName} from './flight-visuals.js';
import {showCoastBlocker, updateDebrisList, updateNavigation} from './flight-hud.js';
import {cameraKeys} from './keyboard-input.js';
/** Starts the loop: requests the first frame. The failure visuals and log are created by app.ts at their original places. */
export function startFrameLoop(
  failureVisuals: FailureVisuals,
  failureLog: ReturnType<typeof mountFailureLog>
) {
  const announcedFailures = new Set();
  // The flight HUD elements the loop reads and writes. They are static in index.html and are looked up
  // once, at the first flight frame.
  const lookUp = () => ({
    throttle: $('#throttle', 'input'),
    warp: $('#warp', 'select'),
    warpStatus: $('#warpStatus', 'small'),
    autoLaunch: $('#autoLaunch', 'button'),
    brake: $('#brake', 'button'),
    sas: $('#sas', 'button'),
    portPower: $('#portPower', 'select'),
    precisionControl: $('#precisionControl', 'button'),
    chuteStatus: $('#chuteStatus', 'small'),
    aeroFlight: $('#aeroFlight', 'small'),
    alt: $('#alt', 'strong'),
    speed: $('#speed', 'strong'),
    navigationFrame: $('#navigationFrame', 'button'),
    navigationAuto: $('#navigationAuto', 'button'),
    vspeed: $('#vspeed', 'strong'),
    throttleVal: $('#throttleVal', 'b'),
    activeVessel: $('#activeVessel', 'span'),
    universalTime: $('#universalTime', 'div'),
    flightStatus: $('#flightStatus', 'span'),
    stage: $('#stage', 'button')
  });
  let found: ReturnType<typeof lookUp> | null = null;
  // Flight.parts is replaced, never edited in place, when parts leave the vessel (staging, fracture), so the
  // array itself keys what was derived from it.
  const partById = new Map<string, FlightPart>();
  let shroudParts: readonly FlightPart[] | null = null,
    shroudSpecs: EngineShroudSpec[] = [];
  function animate(now: number) {
    requestAnimationFrame(animate);
    const {renderer, scene, viewport, camera, controls, ambient, sun, craftRoot} = sceneCore(),
      {highlight, partHover} = selectionOverlays(),
      {maneuverPanel, orbitalPanel, cruisePanel, flightPause, deliveryPanel} = flightPanels(),
      gameAudio = flightAudio();
    gameAudio.update(state.flight, state.atCenter, flightPause.paused);
    failureVisuals.update(state.atCenter ? null : state.flight);
    if (state.flight && !state.atCenter)
      for (const v of [state.flight, ...allDebris(state.flight)])
        for (const e of v.failureEvents ?? []) {
          if (announcedFailures.has(e.id)) continue;
          announcedFailures.add(e.id);
          if (announcedFailures.size > 128) announcedFailures.delete(announcedFailures.values().next().value);
          if (state.flight.universalTime - e.time < 0.5) notify(failureCaption(e));
        }
    if (state.atCenter) {
      state.last = now;
      state.centerView?.render();
      return;
    }
    const dt = Math.max(0, Math.min((now - state.last) / 1000, 0.1));
    state.last = now;
    const hud = state.flight ? (found ??= lookUp()) : null;
    if (state.flight && hud) {
      if (!flightPause.paused) {
        if (throttleUp.codes.some(code => keys.has(code)))
          state.flight.throttle = Math.min(1, state.flight.throttle + dt * 0.35);
        if (throttleDown.codes.some(code => keys.has(code)))
          state.flight.throttle = Math.max(0, state.flight.throttle - dt * 0.35);
        hud.throttle.value = String(state.flight.throttle * 100);
        const transferWindow =
          state.flight.transferGuide &&
          state.flight.transferGuide.firstBurnTime === null &&
          state.flight.transferGuide.startTime - state.flight.universalTime < 15;
        const captureWindow =
          (state.flight.maneuver?.capture ||
            state.flight.maneuver?.returnPlan ||
            state.flight.maneuver?.departure) &&
          !state.flight.maneuver.complete &&
          state.flight.maneuver.universalTime - state.flight.universalTime < 60;
        const maneuverWarp = maneuverPanel.warpBudget(state.flight),
          warpAllowed =
            !dockingPilot.active &&
            maneuverWarp > 0 &&
            !orbitalPanel.active &&
            !cruisePanel.active &&
            !captureWindow &&
            !transferWindow &&
            (state.flight.orbit?.altitude || 0) >
              Math.max(1000, state.flight.orbit?.body.atmosphereTop ?? 70000) &&
            state.flight.throttle === 0 &&
            !keys.size &&
            !state.flight.crashed;
        const physicalSelected = [2, 4].includes(Number(hud.warp.value)),
          physicalStop = physicalWarpStop(state.flight, keys.size > 0);
        if (physicalSelected ? !!physicalStop : !warpAllowed) {
          if (physicalSelected) setText(hud.warpStatus, '通常速度へ：' + physicalStop);
          else if (Number(hud.warp.value) > 1)
            setText(
              hud.warpStatus,
              maneuverPanel.active && maneuverWarp <= 0
                ? '通常速度へ：自動噴射の姿勢合わせ（開始の90秒前から）'
                : '通常速度へ：操作・推力・高度・噴射時刻を確認'
            );
          hud.warp.value = '1';
        }
        const selectedWarp = Number(hud.warp.value);
        try {
          if (selectedWarp > 50) {
            physicsClock.reset();
            const world = currentWorldRuntime();
            world.replace(state.flight);
            const result = world.coast(Math.max(0.000001, Math.min(dt * selectedWarp, maneuverWarp)), {
              input: keys.size > 0 || !!state.launchPilot,
              maxSteps: 64
            });
            showCoastBlocker(result.blocker);
            setText(
              hud.warpStatus,
              result.reason
                ? '通常速度へ：' + showCoastBlocker(result.blocker)
                : '高速航行中 · 姿勢固定 / SAS・RCS停止 · 発電・冷却は継続' +
                    (result.remaining > 0.01 ? ' · 処理上限に合わせ減速' : '')
            );
            if (result.reason) hud.warp.value = '1';
          } else {
            const physicsResult = physicsClock.advance(dt, selectedWarp, step => {
              if (state.launchPilot) {
                const piloted = currentFlight();
                if (keys.size || piloted.crashed) {
                  state.launchPilot = null;
                  hud.autoLaunch.textContent = '自動軌道投入（見本用）';
                } else {
                  const before = piloted.parts,
                    count = before.length;
                  state.launchPilot.update(piloted);
                  showBrakeState(hud.brake, piloted.brake);
                  hud.sas.classList.toggle('active', piloted.sas);
                  setText(hud.sas, 'SAS ' + (piloted.sas ? 'ON' : 'OFF'));
                  // Parts the pilot staged away disappear at once.
                  if (piloted.parts !== before || piloted.parts.length !== count) {
                    const kept = new Set(piloted.parts.map(p => p.id));
                    for (const [id, object] of objects) if (!kept.has(id)) object.visible = false;
                  }
                }
              }
              maneuverPanel.step(currentFlight(), step);
              orbitalPanel.step(currentFlight(), step);
              const autopilotCommands = cruisePanel.step(currentFlight(), step);
              const dockingCommands = dockingPilot.active ? dockingPilot.step(currentFlight(), step) : {};
              const stepped = currentFlight(),
                world = currentWorldRuntime(),
                pitch = keyAxis(keys, pitchKeys);
              // W/S with the brake on drives powered wheels off at once.
              if (releaseBrakeForDrive(stepped, pitch)) {
                showBrakeState(hud.brake, stepped.brake);
                notify('ブレーキを解除しました');
              }
              world.replace(stepped);
              world.step(step, {
                ...manualTranslation(
                  keys,
                  stepped.rocketAxes,
                  Number(hud.portPower.value) / 100,
                  stepped.instrumentRotation
                ),
                precision: hud.precisionControl.getAttribute('aria-pressed') === 'true',
                drive: pitch,
                pitch,
                yaw: keyAxis(keys, yawKeys),
                roll: keyAxis(keys, rollKeys),
                assemblyAttitude: autopilotCommands,
                ...dockingCommands
              });
              updateFlightChallenges();
              if (state.launchPilot?.done) {
                const completionMessage = state.launchPilot.completionMessage;
                state.launchPilot = null;
                hud.autoLaunch.textContent = '自動軌道投入（見本用）';
                notify(completionMessage);
              }
              if (selectedWarp > 1 && physicalWarpStop(currentFlight(), keys.size > 0)) {
                hud.warp.value = '1';
                setText(hud.warpStatus, '通常速度へ：' + physicalWarpStop(currentFlight(), keys.size > 0));
                return false;
              }
            });
            if (Number(hud.warp.value) > 1)
              setText(
                hud.warpStatus,
                '物理計算 ' +
                  selectedWarp +
                  '倍 · 推力・空力・熱・接地を継続' +
                  (physicsResult.limited ? ' · 処理上限に合わせ減速' : '')
              );
          }
        } catch (error) {
          // A throwing step must not end the frame before it renders. Coasting falls back to normal
          // speed; at normal speed the step would throw again every frame, so the flight pauses.
          if (selectedWarp > 50) {
            hud.warp.value = '1';
            setText(hud.warpStatus, '通常速度へ：' + errorMessage(error));
          } else {
            console.error(error);
            flightPause.set(true);
            notify('物理計算を続けられないため一時停止しました：' + errorMessage(error));
          }
        }
      }
      if (shroudParts !== state.flight.parts) {
        shroudParts = state.flight.parts;
        shroudSpecs = engineShrouds(shroudParts);
      }
      syncEngineShrouds(shroudParts, objects, assets.get('engine-shroud'), shroudSpecs);
      craftRoot.position.copy(state.flight.pos);
      craftRoot.quaternion.copy(state.flight.q);
      partById.clear();
      for (const p of state.flight.parts) partById.set(p.id, p);
      for (const [id, o] of objects) {
        o.visible = partById.has(id);
        if (o.visible) markWreckVisual(o, state.flight);
      }
      for (const p of state.flight.parts) {
        const o = objects.get(p.id);
        updateRCSVisual(o, state.flight);
        updateScrewVisual(o, state.flight, p);
        updateGearVisual(o, state.flight);
        if (o) syncCargoVisual(o, p, PARTS[p.type]);
        if (o?.userData.hinge) o.userData.hinge.rotation.x = state.flight.deflections.get(p.id) || 0;
        if (o?.userData.gimbal) {
          const g = state.flight.gimbals.get(p.id);
          o.userData.gimbal.rotation.set(g?.x || 0, 0, g?.z || 0);
        }
        if (o?.userData.rollingVisual) {
          const wheel = state.flight.wheelMotion.get(p.id);
          o.userData.steeringVisual.position.y = -(wheel?.extension ?? 0);
          o.userData.steeringVisual.rotation.y = wheel?.steer || 0;
          o.userData.rollingVisual.rotation.x = wheel?.angle || 0;
        }
      }
      for (const [id, canopy] of parachuteVisuals) {
        const chute = state.flight.chutes.get(id),
          p = partById.get(id);
        canopy.visible = !!p && !!chute && chute.fraction > 0;
        if (p && chute && canopy.visible) {
          canopy.position.fromArray(p.p).applyQuaternion(state.flight.q).add(state.flight.pos);
          canopy.quaternion.setFromUnitVectors(
            new T.Vector3(0, 1, 0),
            bodyUp(canopy.position, state.flight.universalTime)
          );
          const scale = Math.sqrt(chute.fraction);
          canopy.scale.set(scale, 0.45 + 0.55 * scale, scale);
          if (!state.chuteFramed && chute.fraction > 0.1) {
            const offset = camera.position.clone().sub(controls.target);
            camera.position.copy(controls.target).add(offset.setLength(Math.max(50, offset.length())));
            state.chuteFramed = true;
          }
        }
      }
      setText(
        hud.chuteStatus,
        [...state.flight.chutes.values()].map(c => 'パラシュート：' + chuteNames[c.status]).join(' · ')
      );
      setText(
        hud.aeroFlight,
        `失速域の翼: ${state.flight.telemetry.stallCount || 0} · 接地輪: ${state.flight.telemetry.contacts || 0}`
      );
      updateDebrisVisuals(state.flight, now);
      const focus = state.trackedDebris ? vesselCenter(state.trackedDebris) : flightCenter(),
        delta = focus.clone().sub(flightFocus);
      camera.position.add(delta);
      controls.target.add(delta);
      flightFocus.copy(focus);
      sun.position.copy(state.flight.pos).add(new T.Vector3(12, 24, 12));
      sun.target.position.copy(state.flight.pos);
      for (const e of exhaust) {
        updateEnginePlume(e.mesh, state.flight.engineThrust.get(e.id) || 0, state.flight.crashed, now);
      }
      setText(hud.alt, (state.flight.orbit?.altitude || 0).toFixed(1));
      setText(
        hud.speed,
        navigationVelocity(
          flightCenter(),
          state.flight.vel,
          state.flight.universalTime,
          state.flight.navigationFrame
        )
          .length()
          .toFixed(1)
      );
      setText(hud.navigationFrame, state.flight.navigationFrame === 'surface' ? '対地速度' : '軌道速度');
      const navigationAuto = String(state.flight.navigationAuto !== false);
      if (hud.navigationAuto.getAttribute('aria-pressed') !== navigationAuto)
        hud.navigationAuto.setAttribute('aria-pressed', navigationAuto);
      setText(hud.vspeed, (state.flight.orbit?.vertical || 0).toFixed(1));
      setText(hud.throttleVal, Math.round(state.flight.throttle * 100) + '%');
      setText(
        hud.activeVessel,
        (canControl(state.flight) ? '操縦中：' : '観察中：') +
          (state.flight.vesselName ? state.flight.vesselName + ' · ' : '') +
          controlName(state.flight.parts) +
          ' · ' +
          state.flight.parts.length +
          '部品'
      );
      setText(hud.universalTime, formatUniversalTime(state.flight.universalTime) + ' · 宇宙の共通時刻');
      setText(
        hud.flightStatus,
        state.flight.crashed
          ? [...state.flight.thermal.values()].some(s => s.failed)
            ? '熱損傷 — 耐熱限界を超えました'
            : '機体損傷 — 組立棟で設計を見直してください'
          : `T+ ${state.flight.time.toFixed(1)}s · 燃料 ${Math.round(state.flight.fuelRatio * 100)}% · ${state.launchPilot ? state.launchPilot.message : state.flight.landed ? '着地' : state.flight.started ? '試験中' : ['orbit', 'moon-orbit', 'moon-surface', 'transfer'].includes(state.flight.environment) ? '初期円軌道・惰性飛行' : state.flight.environment === 'entry' ? '再突入試験 · SAS逆行で遮熱' : state.flight.environment === 'drop' ? 'カプセル降下試験' : '点火待機'}`
      );
      if (now - state.infoTime > 250) {
        failureLog.update(state.flight);
        updateInfo();
        updateOrbit();
        updateNavigation();
        updateDebrisList();
        state.infoTime = now;
      }
    }
    if (hud && flightPause.paused) {
      keys.clear();
      physicsClock.reset();
      flightPause.refresh();
      hud.stage.disabled = true;
    }
    setCameraUp(
      state.flight
        ? bodyUp(
            state.trackedDebris ? vesselCenter(state.trackedDebris) : flightCenter(),
            state.flight.universalTime
          )
        : new T.Vector3(0, 1, 0)
    );
    {
      const cameraDt = state.cameraKeyTime === null ? 0 : Math.min(0.1, (now - state.cameraKeyTime) / 1000);
      state.cameraKeyTime = now;
      if (!state.atCenter) orbitByArrows(controls, cameraKeys, cameraDt);
    }
    controls.update();
    if (state.flight) {
      const body = referenceBody(controls.target, state.flight.universalTime);
      if (!overWater(camera.position, state.flight.universalTime, body))
        constrainSurfaceCamera(controls, bodyState(body, state.flight.universalTime).position, body.radius);
    }
    if (!state.flight) updatePlacementCopies();
    if (state.flight) updateWorldGeometry();
    if (state.flight)
      scene.fog =
        state.flightScenery?.update(camera, state.flight.universalTime, sun, ambient, [
          planetMaterial,
          patchMaterial
        ]) || null;
    if (highlight.visible) highlight.update();
    if (partHover.visible) {
      craftRoot.updateWorldMatrix(true, true);
      partHover.update();
    }
    deliveryPanel.updateMarker(camera, viewport.clientWidth, viewport.clientHeight);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}

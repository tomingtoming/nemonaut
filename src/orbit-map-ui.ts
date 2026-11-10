// Orbit and map planning (BACKLOG 7c, moved from app.ts unchanged): the orbit readout of the HUD, the map
// overlay with its panels (finite burn, map throttle, maneuver stop, flight map, trajectory), the burn plan
// inputs and the fixed maneuver node. app.ts calls the mount and wire functions at their original places.
// Calls up into app.ts through app-hooks. No import-time side effects.
import * as T from 'three';
import {instrumentForward} from './command-frame.js';
import {mountFiniteBurn} from './finite-burn-panel.js';
import {deorbitPlan} from './deorbit-plan.js';
import {mountMapThrottle, maneuverCountdown} from './map-throttle.js';
import {mountManeuverStop} from './maneuver-stop.js';
import {mapVessels} from './map-vessels.js';
import {maneuverEditValues, createManeuverNode, maneuverDirection} from './maneuver-node.js';
import {mountFlightMap, mountMapPanels} from './flight-map.js';
import {fleet} from './fleet.js';
import {setTarget} from './relative-navigation.js';
import {apsisPlan, formatDuration} from './orbit-plan.js';
import {maneuverPreview} from './maneuver.js';
import {mountTrajectoryPanel} from './trajectory-panel.js';
import {bodyOrbitState} from './celestial.js';
import {closest} from './dom.js';
import {state} from './app-state.js';
import {hooks} from './app-hooks.js';
import {$, errorMessage, notify} from './ui-common.js';
import {currentFlight, flightCenter} from './current-flight.js';
import {sceneCore} from './scene.js';
type MapPanels = {
  finiteBurnPanel: ReturnType<typeof mountFiniteBurn>;
  mapThrottle: ReturnType<typeof mountMapThrottle>;
  mapStopAssist: ReturnType<typeof mountManeuverStop>;
  flightMap: ReturnType<typeof mountFlightMap>;
};
let mounted: MapPanels | null = null;
function mapPanels(): MapPanels {
  if (!mounted) throw Error('軌道図のパネルがまだ作られていません');
  return mounted;
}
export function updateOrbit() {
  const fl = currentFlight(),
    {scene} = sceneCore(),
    o = fl.orbit || bodyOrbitState(flightCenter(), fl.vel, fl.universalTime),
    km = (x: number) => (Number.isFinite(x) ? (x / 1000).toFixed(1) + ' km' : '∞'),
    ap = apsisPlan(o).apoapsis;
  $('#orbitInfo', 'b').textContent =
    o.body.name +
    ' · ' +
    (o.stable ? '周回軌道' : o.energy >= 0 ? '脱出軌道' : o.periapsis < 0 ? '地表と交差' : '大気と交差') +
    ' · 遠点 ' +
    km(o.apoapsis) +
    (ap && typeof ap.time === 'number' && Number.isFinite(ap.time)
      ? '（あと ' + maneuverCountdown(ap.time) + '）'
      : '') +
    ' · 近点 ' +
    km(o.periapsis);
  $('#orbitInfo', 'b').title = '現在の速度から求めた二体軌道の予測。今後の噴射・空気抵抗は含みません。';
  $('#maneuverHud', 'small').textContent = fl.maneuver
    ? fl.maneuver.complete
      ? fl.throttle > 0
        ? '予定Δv到達 · Xで停止'
        : '予定Δv到達 · 噴射停止'
      : '計画残り ' +
        new T.Vector3(...fl.maneuver.remaining).length().toFixed(1) +
        ' m/s · ' +
        (fl.maneuver.time >= fl.time ? '噴射まで ' : '予定から ') +
        maneuverCountdown(Math.abs(fl.maneuver.time - fl.time))
    : '';
  $('#orbitDetail', 'small').textContent =
    '軌道速度 ' +
    o.speed.toFixed(1) +
    ' m/s · 円軌道速度 ' +
    o.circularSpeed.toFixed(0) +
    ' m/s · 重力 ' +
    o.gravity.toFixed(2) +
    ' m/s²';
  if (!$('#orbitOverlay', 'section').hidden) updateOrbitPlan(o);
  const sky = scene.background;
  if (!(sky instanceof T.Color)) throw Error('空の色が設定されていません');
  sky
    .set('#02050d')
    .lerp(new T.Color('#8eb5c8'), o.bodyId === 'planet' ? Math.max(0, 1 - o.altitude / 70000) : 0);
  scene.fog = null;
}
export function mountOrbitMapPanels(stopPilots: () => void) {
  mountMapPanels();
  const finiteBurnPanel = mountFiniteBurn($('#fixManeuver', 'button'), () => state.flight);
  const mapThrottle = mountMapThrottle(
    $('#mapCutoff', 'button'),
    () => state.flight,
    value => {
      stopPilots();
      state.launchPilot = null;
      currentFlight().throttle = value;
      $('#throttle', 'input').value = String(value * 100);
      updateOrbit();
    }
  );
  const mapStopAssist = mountManeuverStop(
    closest($('#fixedManeuverStatus', 'p'), 'fieldset', 'fieldset'),
    () => state.flight
  );
  const flightMap = mountFlightMap(
    $('#largeOrbitMap', 'canvas'),
    id => {
      if (!state.flight) return;
      const target = id ? fleet(state.flight).find(v => v.vesselId === id) : null;
      if (id && !target) return;
      setTarget(state.flight, state.flight, target);
      hooks.updateNavigation();
      hooks.updateDebrisList();
      updateOrbit();
    },
    () => state.flight
  );
  mounted = {finiteBurnPanel, mapThrottle, mapStopAssist, flightMap};
}
export function planDeltaV() {
  const value = (id: string) => {
    const raw = $('#' + id, 'input').value;
    if (raw.trim() === '') throw Error('噴射成分を入力してください');
    return Number(raw);
  };
  return {prograde: value('planDeltaV'), normal: value('planNormal'), radial: value('planRadial')};
}
export function planLocation() {
  const select = $('#planLocation', 'select');
  return select.value === 'custom' ? {universalTime: Number(select.dataset.epoch)} : select.value;
}
export function toggleOrbitMap() {
  if (!state.flight) return;
  $('#orbitOverlay', 'section').hidden = !$('#orbitOverlay', 'section').hidden;
  if (!$('#orbitOverlay', 'section').hidden) updateOrbit();
}
export function wireOrbitMapControls() {
  const {finiteBurnPanel, flightMap} = mapPanels();
  $('#openOrbitMap', 'button').onclick = toggleOrbitMap;
  $('#closeOrbitMap', 'button').onclick = () => ($('#orbitOverlay', 'section').hidden = true);
  for (const control of [
    $('#planEnabled', 'input'),
    $('#planLocation', 'select'),
    $('#planDeltaV', 'input'),
    $('#planNormal', 'input'),
    $('#planRadial', 'input')
  ])
    control.addEventListener('input', () => {
      if (state.flight) updateOrbit();
    });
  $('#planDeorbit', 'button').onclick = () => {
    if (!state.flight) return;
    try {
      const plan = deorbitPlan(flightCenter(), state.flight.vel, state.flight.universalTime);
      $('#planLocation', 'select').value = 'custom';
      $('#planLocation', 'select').dataset.epoch = String(plan.location.universalTime);
      delete $('#planLocation', 'select').dataset.tolerance;
      $('#planDeltaV', 'input').value = String(plan.components.prograde);
      $('#planNormal', 'input').value = '0';
      $('#planRadial', 'input').value = '0';
      $('#planEnabled', 'input').checked = true;
      updateOrbit();
    } catch (e) {
      notify(errorMessage(e));
    }
  };
  $('#fixManeuver', 'button').onclick = () => {
    if (!state.flight) return;
    try {
      const preview = maneuverPreview(
        flightCenter(),
        state.flight.vel,
        planLocation(),
        planDeltaV(),
        state.flight.universalTime
      );
      const nowPlan = $('#planLocation', 'select').value === 'now',
        options: import('./maneuver-node.js').ManeuverNodeOptions = {
          plannedThrottle: finiteBurnPanel.plannedThrottle(preview),
          ...flightMap.plannedOptions(preview)
        };
      if (nowPlan && options.plannedThrottle === undefined && options.rendezvous === undefined)
        options.onAlignment = true;
      const replacement = createManeuverNode(preview, state.flight.time, options);
      if (state.flight.maneuver?.stopAtTarget !== undefined)
        replacement.stopAtTarget = state.flight.maneuver.stopAtTarget;
      if (state.flight.maneuver?.tolerance !== undefined)
        replacement.tolerance = state.flight.maneuver.tolerance;
      if ($('#planLocation', 'select').dataset.tolerance === '0.05') {
        replacement.tolerance = 0.05;
        delete $('#planLocation', 'select').dataset.tolerance;
      }
      state.flight.maneuver = replacement;
      $('#cancelManeuverEdit', 'button').hidden = true;
      $('#planEnabled', 'input').checked = false;
      updateOrbit();
      notify('噴射計画を固定しました。');
    } catch (e) {
      notify(errorMessage(e));
    }
  };
  $('#editManeuver', 'button').onclick = () => {
    if (!state.flight) return;
    try {
      const values = maneuverEditValues(state.flight.maneuver, state.flight.universalTime);
      $('#planLocation', 'select').value = 'custom';
      $('#planLocation', 'select').dataset.epoch = String(values.universalTime);
      for (const [id, key] of [
        ['planDeltaV', 'prograde'],
        ['planNormal', 'normal'],
        ['planRadial', 'radial']
      ] as const)
        $('#' + id, 'input').value = String(Number(values[key].toFixed(6)));
      $('#planEnabled', 'input').checked = true;
      $('#cancelManeuverEdit', 'button').hidden = false;
      $('#mapPlanPanel', 'details').open = true;
      updateOrbit();
    } catch (error) {
      notify(errorMessage(error));
    }
  };
  $('#cancelManeuverEdit', 'button').onclick = () => {
    $('#planEnabled', 'input').checked = false;
    $('#cancelManeuverEdit', 'button').hidden = true;
    if (state.flight) updateOrbit();
  };
  $('#alignManeuver', 'button').onclick = () => {
    if (!state.flight?.maneuver) return;
    state.launchPilot = null;
    state.flight.sas = true;
    state.flight.sasMode = 'maneuver';
    $('#sas', 'button').textContent = 'SAS ON';
    $('#sas', 'button').classList.add('active');
  };
  $('#clearManeuver', 'button').onclick = () => {
    if (!state.flight) return;
    state.flight.maneuver = null;
    if (state.flight.sasMode === 'maneuver') {
      state.flight.sasMode = 'hold';
      state.flight.holdQ = state.flight.q.clone();
    }
    updateOrbit();
  };
  $('#mapCutoff', 'button').onclick = () => {
    if (state.flight) {
      state.launchPilot = null;
      state.flight.throttle = 0;
      $('#throttle', 'input').value = '0';
      updateOrbit();
    }
  };
}
function updateOrbitPlan(o: import('./celestial.js').OrbitState) {
  const fl = currentFlight(),
    {finiteBurnPanel, mapThrottle, mapStopAssist, flightMap} = mapPanels();
  mapStopAssist.update();
  const plan = apsisPlan(o);
  let preview: import('./flight-map.js').FlightMapPreview | null = null;
  $('#maneuverResult', 'p').textContent = '比較プレビューはOFFです。';
  if ($('#planEnabled', 'input').checked) {
    try {
      preview = maneuverPreview(flightCenter(), fl.vel, planLocation(), planDeltaV(), fl.universalTime);
      const km = (x: number) => (Number.isFinite(x) ? (x / 1000).toFixed(1) + ' km' : 'なし（脱出）');
      $('#maneuverResult', 'p').textContent =
        '予定地点まで ' +
        formatDuration(preview.time) +
        ' · Δv ' +
        preview.deltaV.toFixed(1) +
        ' m/s\n予測遠点 ' +
        km(preview.orbit.apoapsis) +
        ' / 近点 ' +
        km(preview.orbit.periapsis) +
        (preview.orbit.periapsis < 0
          ? '\n予測軌道は地表と交差します'
          : preview.orbit.periapsis < preview.orbit.body.atmosphereTop
            ? '\n予測軌道は大気と交差します'
            : '');
    } catch (error) {
      $('#maneuverResult', 'p').textContent = errorMessage(error);
    }
  }
  const node = fl.maneuver;
  let editable = false;
  try {
    maneuverEditValues(node, fl.universalTime);
    editable = true;
  } catch {}
  $('#editManeuver', 'button').disabled = !editable;
  $('#alignManeuver', 'button').disabled = !node;
  $('#clearManeuver', 'button').disabled = !node;
  $('#fixedManeuverStatus', 'p').textContent = '計画なし';
  if (node) {
    const remaining = new T.Vector3(...node.remaining).length(),
      dt = node.time - fl.time,
      forward = instrumentForward(fl.rocketAxes, fl.instrumentRotation).applyQuaternion(fl.q),
      direction = maneuverDirection(node);
    if (!direction) throw Error('噴射方向が分かりません');
    const angle = (forward.angleTo(direction) * 180) / Math.PI;
    $('#fixedManeuverStatus', 'p').textContent =
      (node.complete
        ? fl.throttle > 0
          ? '目標Δv到達：スロットルを切ってください'
          : '目標Δv到達 · 噴射停止'
        : dt >= 0
          ? '噴射まで ' + maneuverCountdown(dt)
          : '予定時刻から ' + maneuverCountdown(-dt)) +
      '\n残り ' +
      remaining.toFixed(node.tolerance === 0.05 ? 2 : 1) +
      ' m/s · 方向差 ' +
      angle.toFixed(1) +
      '°' +
      (node.plannedThrottle && !node.complete
        ? '\n計画推力 ' +
          Math.round(node.plannedThrottle * 100) +
          '%' +
          (fl.throttle > 0 && Math.abs(fl.throttle - node.plannedThrottle) > 0.0001
            ? ' · 現在 ' + Math.round(fl.throttle * 100) + '% ⚠'
            : '')
        : '');
    if (!preview)
      preview = {
        orbit: bodyOrbitState(
          new T.Vector3(...node.position),
          new T.Vector3(...node.velocity),
          node.capture?.midTime ??
            node.returnPlan?.midTime ??
            node.departure?.midTime ??
            node.universalTime ??
            fl.universalTime + node.time - fl.time
        )
      };
  }
  mapThrottle.update(
    preview?.impulse?.length() ?? (node && !node.complete ? new T.Vector3(...node.remaining).length() : null)
  );
  const finite = finiteBurnPanel.update(preview, node);
  if (finite) {
    if (!preview) throw Error('有限噴射の比較には予定軌道が必要です');
    preview = {...preview, finite};
  }
  flightMap.update(o, preview, mapVessels(fl));
  $('#mapFlightState', 'p').textContent =
    '現在 ' + o.speed.toFixed(1) + ' m/s · スロットル ' + Math.round(fl.throttle * 100) + '%';
  $('#orbitKind', 'span').textContent = {
    circular: 'ほぼ円軌道',
    ellipse: '楕円軌道',
    escape: '脱出軌道',
    radial: '半径方向の飛行'
  }[plan.kind];
  $('#orbitCaution', 'p').textContent = plan.caution;
  $('#orbitPeriod', 'p').textContent = '公転周期 ' + formatDuration(plan.period);
  for (const key of ['apoapsis', 'periapsis'] as const) {
    const point = plan[key],
      name = key === 'apoapsis' ? '遠点' : '近点';
    $('#' + key + 'Plan', 'p').textContent = point
      ? name +
        ' ' +
        (point.altitude / 1000).toFixed(1) +
        ' km\n到達まで ' +
        formatDuration(point.time ?? Number.NaN) +
        '\n円軌道化：' +
        (point.deltaV === null
          ? '地表内のため不可'
          : (point.deltaV >= 0 ? '順行 ' : '逆行 ') + Math.abs(point.deltaV).toFixed(1) + ' m/s')
      : name + '：' + (plan.kind === 'circular' ? '円軌道では方向が定まりません' : 'なし');
  }
  $('#orbitPlanNote', 'p').textContent =
    plan.kind === 'escape'
      ? '遠点はありません。近点の到達時間「—」は通過済み、または計算対象外です。'
      : plan.kind === 'circular'
        ? '遠点・近点を指定する必要がない、ほぼ円形の軌道です。'
        : 'Δvはその遠点・近点で瞬間的に噴射する場合の目安です。現在位置での噴射量ではありません。';
}
export function mountOrbitTrajectory() {
  return mountTrajectoryPanel($('.mapContent', 'div'), () => {
    if (!state.flight) return null;
    let burn: import('./trajectory.js').TrajectoryBurn | null = null,
      note = '';
    const time = state.flight.universalTime;
    if ($('#planEnabled', 'input').checked) {
      const preview = maneuverPreview(flightCenter(), state.flight.vel, planLocation(), planDeltaV(), time);
      burn = {time: preview.universalTime, deltaV: preview.impulse.toArray()};
    } else if (state.flight.maneuver && !state.flight.maneuver.complete) {
      const node = state.flight.maneuver,
        burnTime =
          node.capture?.midTime ??
          node.returnPlan?.midTime ??
          node.departure?.midTime ??
          node.universalTime ??
          time + node.time - state.flight.time;
      if (burnTime >= time) burn = {time: burnTime, deltaV: [...node.remaining]};
      else note = '固定計画は過去のため比較対象外';
    }
    return {
      position: flightCenter().clone(),
      velocity: state.flight.vel.clone(),
      time,
      burn,
      note,
      name: state.flight.vesselName || '機体'
    };
  });
}

import {RendezvousPlanBinding, type RendezvousPreview} from './rendezvous-burn.js';
import {centerOfVessel} from './relative-navigation.js';
import {launchPlaneGuide} from './launch-plane.js';
import {deliveryMapView} from './map-site.js';
import {selectedDeliverySite, deliverySitePosition} from './delivery-sites.js';
import {MapBodies} from './map-bodies.js';
import {mapVessels, type MapVessel, type MapVesselEntry} from './map-vessels.js';
import {
  timedRendezvousTransfer,
  timedRelativeStopPlan,
  type TimedTransferVessel,
  type TransferBurnTiming,
  type BurnTimingOptions
} from './timed-rendezvous.js';
import {
  rendezvousTransfer,
  type RendezvousTransfer,
  type RendezvousTransferOptions
} from './rendezvous-transfer.js';
import {relativeStopPlan, type RelativeStopPlan} from './relative-stop-plan.js';
import {closestApproach, maneuverApproach, type ClosestApproach} from './closest-approach.js';
import {relativeOrbitPlane} from './relative-orbit-plane.js';
import {maneuverHandles, draggedComponent, type ManeuverHandle} from './maneuver-gizmo.js';
import {mapPointEpoch, maneuverPreview, type ManeuverPreview, type ManeuverComponents} from './maneuver.js';
import * as T from 'three';
import {element, byId, closest} from './dom.js';
import {PRIMARY, MOON, bodyState, type CelestialBody, type OrbitState} from './celestial.js';
import {center} from './planet.js';
import {projectTrackingPoint} from './tracking-orbits.js';
import {clampExtent, hitRadius, DoubleTap, Pinch} from './touch-map.js';
/** The flight fields the map reads (a Flight satisfies it). */
export type FlightMapVessel = TimedTransferVessel & MapVessel & {environment?: string};
/** Orbit fields mapConic draws from. */
export type MapConicOrbit = Pick<
  OrbitState,
  'normal' | 'p' | 'eccentricity' | 'evec' | 'r' | 'body' | 'center'
>;
/** A maneuver preview, optionally with a finite-burn comparison. */
export type FlightMapPreview = (ManeuverPreview | import('./maneuver.js').NodeOrbitPreview) & {
  finite?: Pick<import('./finite-burn.js').FiniteBurnPreview, 'points' | 'orbit'> | null;
};
/** Result of the speed-match plan: instantaneous or burn-time corrected. */
export type StopPlanResult = RelativeStopPlan & {burn?: TransferBurnTiming};
/** Result of the transfer plan: instantaneous or burn-time corrected. */
export type TransferPlanResult = RendezvousTransfer | ReturnType<typeof timedRendezvousTransfer>;
/** The plan fields rememberTimed binds to the automatic burn. */
export interface RememberedPlan {
  burn?: TransferBurnTiming;
  epoch?: number;
  location?: RelativeStopPlan['location'];
  components: ManeuverComponents;
}
export interface MapMarker {
  x: number;
  y: number;
  key: string;
}
export interface MapFocusHit {
  x: number;
  y: number;
  radius: number;
  focus: string;
}
export interface MapOrbitHit {
  x: number;
  y: number;
  point: T.Vector3;
}
export type MapScreenHandle = ManeuverHandle & {x: number; y: number};
export interface MapDrag {
  button: number;
  x: number;
  y: number;
  moved: boolean;
  handle: MapScreenHandle | null | undefined;
  start: number;
}
export function mapConic(o: MapConicOrbit, limit: number): (T.Vector3 | null)[] {
  if (o.normal.lengthSq() < 0.5 || o.p < 1) return [];
  const x = o.eccentricity > 1e-7 ? o.evec.clone().normalize() : o.r.clone().normalize(),
    y = o.normal.clone().cross(x).normalize(),
    points: (T.Vector3 | null)[] = [];
  for (let i = 0; i <= 720; i++) {
    const a = (i * Math.PI) / 360,
      den = 1 + o.eccentricity * Math.cos(a),
      r = o.p / den;
    points.push(
      den > 0 && r >= o.body.radius && r <= Math.min(limit, o.body.sphereOfInfluence ?? Infinity)
        ? x
            .clone()
            .multiplyScalar(r * Math.cos(a))
            .addScaledVector(y, r * Math.sin(a))
            .add(o.center)
        : null
    );
  }
  return points;
}
export function mountFlightMap(
  canvas: HTMLCanvasElement,
  onTarget: (id: string | null) => void = () => {},
  getFlight: () => FlightMapVessel | null = () => null
) {
  const timedBinding = new RendezvousPlanBinding();
  const rememberTimed = (result: RememberedPlan) => {
    const f = getFlight();
    if (!result.burn) {
      timedBinding.clear();
      return;
    }
    if (!f) throw Error('飛行中の機体がありません');
    const location = result.location,
      epoch = result.epoch ?? (typeof location === 'object' ? location.universalTime : undefined);
    if (epoch === undefined) throw Error('噴射時間補正の計画に噴射時刻がありません');
    timedBinding.remember(
      f,
      maneuverPreview(centerOfVessel(f), f.vel, {universalTime: epoch}, result.components, f.universalTime),
      result.burn
    );
  };
  const context = canvas.getContext('2d');
  if (!context) throw Error('2D描画を初期化できません');
  const ctx = context;
  let bodyRenderer: MapBodies | undefined;
  try {
    bodyRenderer = new MapBodies();
  } catch (error) {
    console.warn('Map surface renderer unavailable', error);
  }
  const flightNow = () => {
      const f = getFlight();
      if (!f) throw Error('飛行中の機体がありません');
      return f;
    },
    orbitNow = () => {
      if (!current) throw Error('現在の軌道がありません');
      return current;
    };
  let current: OrbitState | null = null,
    preview: FlightMapPreview | null | undefined = null,
    yaw = 1.15,
    pitch = 0.4,
    extent: number | null = null,
    focus = 'body',
    drag: MapDrag | null = null,
    markers: MapMarker[] = [],
    focusHits: MapFocusHit[] = [],
    orbitHits: MapOrbitHit[] = [],
    handles: MapScreenHandle[] = [],
    vessels: MapVesselEntry[] = [],
    encounter: ClosestApproach | null = null,
    encounterTarget: string | null = null,
    plannedEncounter: ClosestApproach | null = null;
  const overlay = element(document, '#orbitOverlay', 'section'),
    header = element(overlay, '.mapHeader', 'div');
  const toolbar = document.createElement('div');
  toolbar.className = 'mapToolbar';
  for (const [key, name] of [
    ['body', '現在の天体'],
    ['craft', '機体'],
    ['target', '目標'],
    ['planet', '母星'],
    ['moon', '月'],
    ['system', '全体'],
    ['site', selectedDeliverySite().name]
  ]) {
    const b = document.createElement('button');
    b.textContent = name;
    b.dataset.focus = key;
    b.onclick = () => {
      focus = key;
      extent = null;
      if (key === 'site') {
        const view = deliveryMapView(current?.universalTime ?? 0, selectedDeliverySite());
        yaw = view.yaw;
        pitch = view.pitch;
      }
      draw();
    };
    toolbar.append(b);
  }
  header.append(toolbar);
  const targetPanel = document.createElement('details');
  targetPanel.className = 'mapTargets';
  const targetSummary = document.createElement('summary');
  targetSummary.textContent = '目標 / 接近';
  targetPanel.append(targetSummary);
  const targetSelect = document.createElement('select');
  targetSelect.setAttribute('aria-label', 'マップの目標機体');
  const clear = document.createElement('button');
  clear.textContent = '目標解除';
  const targetText = document.createElement('small');
  targetPanel.append(targetSelect, clear, targetText);
  overlay.append(targetPanel);
  targetSelect.onchange = () => onTarget(targetSelect.value || null);
  clear.onclick = () => onTarget(null);
  let targetSignature = '';
  const predict = document.createElement('button');
  predict.textContent = '最接近を予測';
  predict.title = '無噴射の二体軌道。最大6時間。計算時点の予測を保持';
  const prediction = document.createElement('small');
  targetPanel.append(predict, prediction);
  predict.onclick = () => {
    plannedEncounter = null;
    comparison.textContent = '';
    const target = vessels.find(v => v.target && !v.stopped);
    try {
      if (!target) throw Error('同じ天体・時刻の軌道を選んでください');
      encounter = closestApproach(orbitNow(), target.orbit);
      encounterTarget = target.id;
      prediction.textContent =
        '無噴射・計算時点から約' +
        (encounter.time / 60).toFixed(1) +
        '分後 · ' +
        (encounter.distance / 1000).toFixed(2) +
        ' km · ' +
        encounter.speed.toFixed(2) +
        ' m/s';
      prediction.title =
        '無噴射・計算時点UT ' +
        encounter.computedAt.toFixed(1) +
        ' · 探索期間 ' +
        (encounter.horizon / 3600).toFixed(2) +
        '時間（数値探索の近似）';
    } catch (error) {
      encounter = null;
      prediction.textContent = error instanceof Error ? error.message : String(error);
    }
    draw();
  };
  const compare = document.createElement('button');
  compare.textContent = '噴射後を比較';
  compare.title = '編集中の瞬間噴射と無噴射を、噴射時刻から同じ期間で比較';
  const comparison = document.createElement('small');
  targetPanel.append(compare, comparison);
  compare.onclick = () => {
    try {
      const plan = preview,
        result = maneuverApproach(plan, vessels.find(v => v.target && !v.stopped)?.orbit);
      if (!plan?.burnVel) throw Error('目標と編集中のマニューバが必要です');
      encounter = result.baseline;
      plannedEncounter = result.planned;
      encounterTarget = targetSelect.value;
      prediction.textContent = '';
      comparison.textContent =
        '計算時点の計画 · 無噴射 ' +
        (result.baseline.distance / 1000).toFixed(2) +
        ' → 噴射後 ' +
        (result.planned.distance / 1000).toFixed(2) +
        ' km · ' +
        result.planned.speed.toFixed(2) +
        ' m/s · 噴射から' +
        (result.planned.time / 60).toFixed(1) +
        '分';
      comparison.title =
        '瞬間噴射 Δv ' +
        plan.impulse.length().toFixed(1) +
        ' m/s · 噴射UT ' +
        result.planned.computedAt.toFixed(1) +
        ' から共通の ' +
        (result.planned.horizon / 3600).toFixed(2) +
        '時間を探索 · 噴射後の最接近は噴射から ' +
        (result.planned.time / 60).toFixed(1) +
        '分後。編集・噴射後は再計算';
    } catch (error) {
      plannedEncounter = null;
      encounter = null;
      comparison.textContent = error instanceof Error ? error.message : String(error);
    }
    draw();
  };
  const stopWhen = document.createElement('select');
  stopWhen.setAttribute('aria-label', '速度合わせの時点');
  for (const [value, name] of [
    ['closest', '最接近時'],
    ['timed', '最接近時 · 噴射時間補正'],
    ['now', '現在位置']
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = name;
    stopWhen.append(option);
  }
  targetPanel.append(stopWhen);
  const burnPower = document.createElement('select');
  burnPower.setAttribute('aria-label', '補正計算の噴射推力');
  for (const [value, label] of [
    ['0.1', '噴射 10%固定'],
    ['taper', '噴射 100→10→1%']
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    burnPower.append(option);
  }
  burnPower.title =
    '移送・速度合わせの時間補正に使用。計画固定後の自動噴射へ推力・開始時刻・精密0.05m/sを引き継ぐ';
  targetPanel.append(burnPower);
  const burnOptions = () => ({burnThrottle: burnPower.value === 'taper' ? null : Number(burnPower.value)}),
    burnDescription = (burn: Pick<TransferBurnTiming, 'burnThrottle'>) =>
      burn.burnThrottle === null ? '100→10→1%' : Math.round(burn.burnThrottle * 100) + '%固定';
  const launchReadout = document.createElement('small');
  launchReadout.className = 'mapLaunchPlane';
  launchReadout.hidden = true;
  launchReadout.title =
    '地表の現在地点を固定地点として計算。目標の軌道面を通る時刻と慣性系の接線方位です。上昇時間・自転速度の補償・相手機との会合時刻は含みません';
  targetText.after(launchReadout);
  const stopPlan = document.createElement('button');
  stopPlan.textContent = '速度合わせ案を作成';
  stopPlan.title =
    '選択した時点で相対速度を落とす単一の瞬間噴射案。位置は移動せず、既存計画への追加ではありません';
  targetPanel.append(stopPlan);
  stopPlan.onclick = () => {
    try {
      const result: StopPlanResult =
          stopWhen.value === 'timed'
            ? timedRelativeStopPlan(
                flightNow(),
                mapVessels(flightNow()).find(v => v.id === targetSelect.value)?.orbit,
                burnOptions()
              )
            : relativeStopPlan(orbitNow(), vessels.find(v => v.target && !v.stopped)?.orbit, stopWhen.value),
        select = element(document, '#planLocation', 'select');
      select.value = result.location === 'now' ? 'now' : 'custom';
      if (result.location !== 'now') select.dataset.epoch = String(result.location.universalTime);
      if (result.burn) select.dataset.tolerance = '0.05';
      else delete select.dataset.tolerance;
      for (const [id, key] of [
        ['planDeltaV', 'prograde'],
        ['planNormal', 'normal'],
        ['planRadial', 'radial']
      ] as const)
        byId(id, 'input').value = String(Number(result.components[key].toFixed(6)));
      element(document, '#planEnabled', 'input').checked = true;
      element(document, '#mapPlanPanel', 'details').open = true;
      select.dispatchEvent(new Event('input', {bubbles: true}));
      rememberTimed(result);
      plannedEncounter = null;
      encounter = null;
      prediction.textContent =
        '計算時点の案 · Δv ' +
        result.deltaV.toFixed(1) +
        ' m/s · 噴射時の距離 ' +
        (result.distance / 1000).toFixed(2) +
        ' km' +
        (result.burn
          ? ' · ' +
            burnDescription(result.burn) +
            ' · 開始を' +
            result.burn.offset.toFixed(2) +
            '秒前倒し · 噴射' +
            result.burn.duration.toFixed(2) +
            '秒'
          : '');
      prediction.title =
        '現在の無噴射軌道から作成。瞬間噴射直後の相対速度を0にする近似。位置の差とその後の重力差は残ります。時間補正は選択した噴射推力・精密0.05m/s停止';
      encounterTarget = targetSelect.value;
    } catch (error) {
      prediction.textContent = error instanceof Error ? error.message : String(error);
    }
    draw();
  };
  const transferPanel = document.createElement('details'),
    transferSummary = document.createElement('summary');
  transferPanel.className = 'mapTransfer';
  transferSummary.textContent = '目標への移送';
  transferPanel.append(transferSummary);
  const transferDuration = document.createElement('select');
  transferDuration.setAttribute('aria-label', '移送の飛行時間');
  const automaticDuration = document.createElement('option');
  automaticDuration.value = 'auto';
  automaticDuration.textContent = '自動';
  transferDuration.append(automaticDuration);
  for (const minutes of [2, 5, 10, 20, 60]) {
    const option = document.createElement('option');
    option.value = String(minutes * 60);
    option.textContent = minutes + '分';
    transferDuration.append(option);
  }
  transferDuration.value = 'auto';
  const timedLabel = document.createElement('label'),
    timedInput = document.createElement('input');
  timedInput.type = 'checkbox';
  timedInput.setAttribute('aria-label', '噴射時間を補正');
  timedLabel.append(timedInput, document.createTextNode('噴射時間を補正'));
  timedLabel.title = '点火済み・スロットル0で計算。選択した噴射推力で、精密0.05m/sで停止する操作を仮定';
  const transferButton = document.createElement('button');
  transferButton.textContent = '移送案を作成';
  transferButton.title =
    '120秒後に出発。自動は1〜120分から大気を避ける案を探し、出発Δvと到着速度差の合計で選択。到着時の減速は別途必要';
  const transferResult = document.createElement('small');
  transferPanel.append(transferDuration, timedLabel, transferButton, transferResult);
  targetPanel.append(transferPanel);
  transferButton.onclick = () => {
    try {
      const target = vessels.find(v => v.target && !v.stopped)?.orbit,
        options: RendezvousTransferOptions & BurnTimingOptions = {
          duration: transferDuration.value === 'auto' ? 'auto' : Number(transferDuration.value),
          ...burnOptions()
        },
        result: TransferPlanResult = timedInput.checked
          ? timedRendezvousTransfer(
              flightNow(),
              mapVessels(flightNow()).find(v => v.id === targetSelect.value)?.orbit,
              options
            )
          : rendezvousTransfer(orbitNow(), target, options),
        select = element(document, '#planLocation', 'select');
      select.value = 'custom';
      select.dataset.epoch = String(result.epoch);
      if (result.burn) select.dataset.tolerance = '0.05';
      else delete select.dataset.tolerance;
      for (const [id, key] of [
        ['planDeltaV', 'prograde'],
        ['planNormal', 'normal'],
        ['planRadial', 'radial']
      ] as const)
        byId(id, 'input').value = String(Number(result.components[key].toFixed(6)));
      element(document, '#planEnabled', 'input').checked = true;
      element(document, '#mapPlanPanel', 'details').open = true;
      select.dispatchEvent(new Event('input', {bubbles: true}));
      rememberTimed(result);
      encounter = null;
      plannedEncounter = null;
      prediction.textContent = '';
      encounterTarget = targetSelect.value;
      transferResult.textContent =
        result.duration / 60 +
        '分案 · 出発 Δv ' +
        result.deltaV.toFixed(1) +
        ' m/s · 到着速度差 ' +
        result.arrivalSpeed.toFixed(1) +
        ' m/s · 目標外側100m' +
        (result.burn
          ? ' · ' +
            burnDescription(result.burn) +
            ' · 開始を' +
            result.burn.offset.toFixed(2) +
            '秒前倒し · 噴射' +
            result.burn.duration.toFixed(2) +
            '秒'
          : '');
      transferResult.title =
        '計算時点の瞬間噴射案。出発UT ' +
        result.epoch.toFixed(1) +
        '、到着UT ' +
        result.arrivalTime.toFixed(1) +
        (result.burn
          ? '。選択した噴射推力、精密0.05m/s停止。姿勢・操作遅れによる誤差は残ります'
          : '。2分後の出発を仮定。噴射時間による誤差は含まない');
    } catch (error) {
      transferResult.textContent = error instanceof Error ? error.message : String(error);
    }
    draw();
  };
  overlay.addEventListener('input', e => {
    const targetId = e.target instanceof Element ? e.target.id : '';
    if (!['planEnabled', 'planLocation', 'planDeltaV', 'planNormal', 'planRadial'].includes(targetId)) return;
    timedBinding.clear();
    transferResult.textContent = '';
    if (comparison.textContent) {
      plannedEncounter = null;
      encounter = null;
      comparison.textContent = '';
      draw();
    }
  });
  const status = document.createElement('span');
  status.id = 'mapScale';
  toolbar.append(status);
  canvas.title =
    '右ドラッグで回転（左ドラッグも可） · ホイールで拡大縮小 · 天体をダブルクリックで中心へ · 軌道クリックで計画 · 色付きハンドルでΔv調整（Shiftで微調整）';
  // Touch (BACKLOG 8d): two fingers pinch-zoom like the wheel, a double tap re-centres like dblclick.
  const pinch = new Pinch(),
    doubleTap = new DoubleTap();
  let lastPointerType = '';
  const cancelDrag = () => {
    if (drag?.handle) {
      const input = byId(drag.handle.id, 'input');
      input.value = String(drag.start);
      input.dispatchEvent(new Event('input', {bubbles: true}));
    }
    drag = null;
  };
  const touchUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') pinch.up(e.pointerId);
  };
  canvas.addEventListener('pointerdown', e => {
    lastPointerType = e.pointerType;
    if (e.pointerType === 'touch') {
      const rect = canvas.getBoundingClientRect();
      if (pinch.down(e.pointerId, e.clientX - rect.left, e.clientY - rect.top, extent)) {
        cancelDrag();
        doubleTap.reset();
      }
      if (pinch.count > 1) return;
    }
    const rect = canvas.getBoundingClientRect(),
      handle = handles.find(
        h =>
          Math.hypot(h.x - e.clientX + rect.left, h.y - e.clientY + rect.top) < hitRadius(12, e.pointerType)
      );
    if (e.button !== 0 && e.button !== 2) return;
    drag = {
      button: e.button,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      handle: e.button === 0 ? handle : null,
      start: handle ? Number(byId(handle.id, 'input').value) : 0
    };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') {
      const rect = canvas.getBoundingClientRect(),
        zoomed = pinch.move(e.pointerId, e.clientX - rect.left, e.clientY - rect.top);
      if (zoomed !== null) {
        extent = zoomed;
        draw();
        return;
      }
    }
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    drag.moved ||= Math.abs(dx) + Math.abs(dy) > 2;
    if (drag.handle) {
      const handleId = drag.handle.id,
        input = byId(handleId, 'input'),
        others = ['planDeltaV', 'planNormal', 'planRadial']
          .filter(id => id !== handleId)
          .map(id => Number(byId(id, 'input').value));
      input.value = String(
        Number(draggedComponent(drag.start, dx, dy, drag.handle, others, e.shiftKey).toFixed(2))
      );
      input.dispatchEvent(new Event('input', {bubbles: true}));
      return;
    }
    yaw += dx * 0.006;
    pitch = T.MathUtils.clamp(pitch + dy * 0.006, -1.5, 1.5);
    drag.x = e.clientX;
    drag.y = e.clientY;
    draw();
  });
  canvas.addEventListener('pointerup', e => {
    touchUp(e);
    if (e.pointerType === 'touch') {
      const rect = canvas.getBoundingClientRect();
      if (!drag || drag.moved) doubleTap.reset();
      else if (doubleTap.tap(e.timeStamp, e.clientX - rect.left, e.clientY - rect.top)) {
        recenter(e.clientX - rect.left, e.clientY - rect.top, hitRadius(12, 'touch'));
        drag = null;
        return;
      }
    }
    if (drag && drag.button === 0 && !drag.moved && !drag.handle) {
      const rect = canvas.getBoundingClientRect(),
        hit = markers
          .map(m => ({...m, d: Math.hypot(m.x - (e.clientX - rect.left), m.y - (e.clientY - rect.top))}))
          .filter(m => m.d < hitRadius(22, e.pointerType))
          .sort((a, b) => a.d - b.d)[0];
      if (hit?.key?.startsWith('epoch:')) {
        const select = element(document, '#planLocation', 'select');
        select.value = 'custom';
        select.dataset.epoch = hit.key.slice(6);
        element(document, '#planEnabled', 'input').checked = true;
        element(document, '#mapPlanPanel', 'details').open = true;
        select.dispatchEvent(new Event('input', {bubbles: true}));
        drag = null;
        return;
      }
      if (hit?.key?.startsWith('vessel:')) {
        onTarget(hit.key.slice(7));
        drag = null;
        return;
      }
      if (hit?.key === 'node') {
        const edit = element(document, '#editManeuver', 'button');
        if (!edit.disabled) edit.click();
        drag = null;
        return;
      }
      if (hit) {
        element(document, '#planLocation', 'select').value = hit.key;
        element(document, '#planEnabled', 'input').checked = true;
        element(document, '#mapPlanPanel', 'details').open = true;
        element(document, '#planLocation', 'select').dispatchEvent(new Event('input', {bubbles: true}));
      } else {
        const x = e.clientX - rect.left,
          y = e.clientY - rect.top,
          near = orbitHits.map(p => ({...p, d: Math.hypot(p.x - x, p.y - y)})).sort((a, b) => a.d - b.d)[0];
        if (near && near.d < hitRadius(14, e.pointerType)) {
          try {
            const epoch = mapPointEpoch(orbitNow(), near.point),
              select = element(document, '#planLocation', 'select');
            select.dataset.epoch = String(epoch);
            select.value = 'custom';
            element(document, '#planEnabled', 'input').checked = true;
            element(document, '#mapPlanPanel', 'details').open = true;
            select.dispatchEvent(new Event('input', {bubbles: true}));
          } catch (error) {
            element(document, '#mapPlanPanel', 'details').open = true;
            element(document, '#maneuverResult', 'p').textContent =
              error instanceof Error ? error.message : String(error);
          }
        }
      }
    }
    drag = null;
  });
  canvas.addEventListener('pointercancel', e => {
    touchUp(e);
    drag = null;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  const recenter = (x: number, y: number, minRadius: number) => {
    const hit = focusHits
      .filter(p => Math.hypot(p.x - x, p.y - y) <= Math.max(p.radius, minRadius))
      .sort((a, b) => a.radius - b.radius)[0];
    if (hit) {
      focus = hit.focus;
      extent = null;
      draw();
    }
  };
  canvas.addEventListener('dblclick', e => {
    // A touch double tap is handled on pointerup; ignore the dblclick Chrome may synthesize from it.
    if (lastPointerType === 'touch') return;
    const rect = canvas.getBoundingClientRect();
    recenter(e.clientX - rect.left, e.clientY - rect.top, 0);
  });
  canvas.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      extent = clampExtent((extent ?? 0) * Math.exp(e.deltaY * 0.001));
      draw();
    },
    {passive: false}
  );
  new ResizeObserver(() => draw()).observe(canvas);
  function draw() {
    element(toolbar, '[data-focus=site]', 'button').textContent = selectedDeliverySite().name;
    if (!current || overlay.hidden) return;
    const trajectory = overlay.querySelector('.trajectoryPanel');
    if (trajectory && trajectory.parentElement !== overlay.querySelector('.mapReadings'))
      element(overlay, '.mapReadings', 'div').append(trajectory);
    const o = current,
      time = o.universalTime ?? 0,
      moon = bodyState(MOON, time).position,
      body = o.body,
      w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const origin =
      focus === 'system' || focus === 'planet' || focus === 'site'
        ? center
        : focus === 'moon'
          ? moon
          : focus === 'craft'
            ? o.r.clone().add(o.center)
            : focus === 'target'
              ? (vessels.find(v => v.target)?.position ?? o.center)
              : o.center;
    if (extent === null)
      extent =
        focus === 'system'
          ? MOON.orbitRadius * 1.25
          : focus === 'moon'
            ? MOON.radius * 3
            : focus === 'site'
              ? PRIMARY.radius * 1.4
              : focus === 'planet'
                ? PRIMARY.radius * 2
                : Math.max(
                    body.radius * 1.5,
                    Math.min(
                      body.sphereOfInfluence ?? 2e7,
                      Number.isFinite(o.apoapsis) ? body.radius + o.apoapsis : o.radius * 2
                    )
                  ) * 1.15;
    const scale = (Math.min(w, h) * 0.42) / extent,
      cx = w / 2,
      cy = h / 2;
    const project = (v: T.Vector3): [number, number, number] => {
      const p = projectTrackingPoint(v.clone().sub(origin).toArray(), yaw, pitch);
      return [cx + p[0] * scale, cy - p[1] * scale, p[2]];
    };
    ctx.fillStyle = '#03070e';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 180; i++) {
      ctx.fillStyle = i % 7 ? '#586574' : '#bac3cf';
      ctx.fillRect((((i * 7919) % 1009) / 1009) * w, (((i * 3571) % 997) / 997) * h, i % 7 ? 1 : 1.5, 1);
    }
    const bodies = (): [CelestialBody, T.Vector3][] => [
      [PRIMARY, center],
      [MOON, moon]
    ];
    const path = (points: readonly (T.Vector3 | null)[], color: string, dashed = false, pick = false) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(dashed ? [7, 5] : []);
      ctx.beginPath();
      let prior = false;
      for (const v of points) {
        if (!v) {
          prior = false;
          continue;
        }
        const [x, y, z] = project(v);
        const hidden = bodies().some(([b, p]) => {
          const [bx, by, bz] = project(p),
            r = b.radius * scale;
          return z < bz && (x - bx) ** 2 + (y - by) ** 2 < r * r;
        });
        if (hidden) {
          prior = false;
          continue;
        }
        if (pick) orbitHits.push({x, y, point: v});
        if (prior) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        prior = true;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    focusHits = [];
    const moonOrbit: T.Vector3[] = [];
    for (let i = 0; i <= 180; i++) {
      const a = (i * Math.PI) / 90;
      moonOrbit.push(
        center.clone().add(new T.Vector3(0, MOON.orbitRadius * Math.cos(a), MOON.orbitRadius * Math.sin(a)))
      );
    }
    for (const [b, pos] of bodies().sort((a, b) => project(a[1])[2] - project(b[1])[2])) {
      const [x, y] = project(pos),
        r = b.radius * scale;
      focusHits.push({x, y, radius: Math.max(12, r), focus: b.id === 'moon' ? 'moon' : 'planet'});
      if (x + r < 0 || y + r < 0 || x - r > w || y - r > h) continue;
      if (bodyRenderer && r >= 3) {
        ctx.drawImage(bodyRenderer.image(b, yaw, pitch, time), x - r, y - r, r * 2, r * 2);
      } else {
        const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, Math.max(1, r));
        g.addColorStop(0, b.id === 'moon' ? '#c2c1b8' : '#628c83');
        g.addColorStop(0.65, b.id === 'moon' ? '#656971' : '#274c63');
        g.addColorStop(1, '#0a1726');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2, r), 0, Math.PI * 2);
        ctx.fill();
      }
      if (b.atmosphereTop) {
        ctx.strokeStyle = '#5ea9d855';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, r * (1 + b.atmosphereTop / b.radius), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#bdc8d5';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, x, y + Math.max(2, r) + 18);
    }
    for (const vessel of vessels)
      if (!vessel.stopped) path(mapConic(vessel.orbit, 6e7), vessel.target ? '#ee95e8' : '#526e78', true);
    orbitHits = [];
    path(moonOrbit, '#49515c');
    path(mapConic(o, 6e7), '#e5a45b', false, true);
    if (preview) path(mapConic(preview.orbit, 6e7), '#7de6ef', true);
    if (preview?.finite) {
      path(preview.finite.points, '#9be888');
      path(mapConic(preview.finite.orbit, 6e7), '#9be888', true);
    }
    const marker = (pos: T.Vector3, label: string, color: string, key?: string | null) => {
      const [x, y, z] = project(pos);
      if (x < 10 || y < 65 || x > w - 10 || y > h - 20) return;
      ctx.fillStyle = color;
      ctx.strokeStyle = '#03070e';
      ctx.lineWidth = 3;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      const ly = label === 'AN' || label === 'DN' ? y + 24 : y - 13;
      ctx.strokeText(label, x, ly);
      ctx.fillText(label, x, ly);
      if (key) markers.push({x, y, key});
    };
    markers = [];
    for (const [i, v] of vessels.entries())
      marker(
        v.position,
        v.target ? '◎ ' + v.name : String(i + 1),
        v.target ? '#ee95e8' : '#8fa7b0',
        'vessel:' + v.id
      );
    if (o.eccentricity > 1e-4 && o.normal.lengthSq() > 0.5) {
      const axis = o.evec.clone().normalize();
      for (const [key, label, r, sign] of [
        ['apoapsis', 'Ap', body.radius + o.apoapsis, -1],
        ['periapsis', 'Pe', body.radius + o.periapsis, 1]
      ] as const)
        if (Number.isFinite(r) && r >= body.radius && r < (body.sphereOfInfluence ?? Infinity))
          marker(
            axis
              .clone()
              .multiplyScalar(r * sign)
              .add(o.center),
            label + ' ' + ((r - body.radius) / 1000).toFixed(1) + ' km',
            '#b9dcff',
            key
          );
    }
    const site = deliverySitePosition(time, selectedDeliverySite()),
      [sx, sy, sz] = project(site),
      [px, py, pz] = project(center),
      back = sz < pz;
    if (sx >= 16 && sx <= w - 16 && sy >= 80 && sy <= h - 50) {
      ctx.strokeStyle = '#d4ec9c';
      ctx.fillStyle = '#d4ec9c';
      ctx.lineWidth = 2;
      ctx.setLineDash(back ? [3, 3] : []);
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#03070e';
      ctx.lineWidth = 3;
      const label = selectedDeliverySite().name + (back ? ' · 裏側' : '');
      ctx.strokeText(label, sx, sy + 28);
      ctx.fillText(label, sx, sy + 28);
    }
    const target = vessels.find(v => v.target && !v.stopped),
      plane = getFlight()?.landed ? null : relativeOrbitPlane(o, target?.orbit);
    if (plane)
      for (const node of plane.nodes)
        marker(node.position, node.label, '#bcf18c', node.epoch === null ? null : 'epoch:' + node.epoch);
    const craftPoint = project(o.r.clone().add(o.center));
    focusHits.push({x: craftPoint[0], y: craftPoint[1], radius: 16, focus: 'craft'});
    marker(o.r.clone().add(o.center), '◆ 機体', '#fff');
    if (preview)
      marker(
        preview.orbit.r.clone().add(preview.orbit.center),
        '◇ 噴射',
        '#7de6ef',
        preview.burnVel ? null : 'node'
      );
    handles = [];
    if (preview?.burnVel && element(document, '#planEnabled', 'input').checked) {
      const [x, y] = project(preview.burnPos);
      for (const handle of maneuverHandles(preview, yaw, pitch)) {
        const hx = x + handle.dx * 60,
          hy = y + handle.dy * 60;
        ctx.strokeStyle = handle.color;
        ctx.fillStyle = '#15212b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(hx, hy, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = handle.color;
        ctx.font = '10px sans-serif';
        ctx.fillText(handle.label, hx, hy + 3);
        handles.push({...handle, x: hx, y: hy});
      }
    }
    if (encounter) {
      path([encounter.own, encounter.target], '#ffdc70', true);
      marker(encounter.own, '接近時 自機', '#ffdc70');
      marker(encounter.target, '接近時 目標', '#ee95e8');
    }
    if (plannedEncounter) {
      path([plannedEncounter.own, plannedEncounter.target], '#7de6ef', true);
      marker(plannedEncounter.own, '噴射後 自機', '#7de6ef');
      marker(plannedEncounter.target, '噴射後 目標', '#ee95e8');
    }
    status.textContent = (extent / 1000).toFixed(0) + ' km';
    for (const b of toolbar.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.focus === focus));
      if (b.dataset.focus === 'target') b.disabled = !vessels.some(v => v.target);
    }
  }
  return {
    plannedOptions(p: RendezvousPreview) {
      return timedBinding.options(getFlight(), p);
    },
    update(o: OrbitState, p: FlightMapPreview | null | undefined, others: MapVesselEntry[] = []) {
      timedBinding.observe(getFlight());
      vessels = others;
      const signature = JSON.stringify(others.map(v => [v.id, v.name]));
      if (signature !== targetSignature) {
        targetSelect.replaceChildren();
        const none = document.createElement('option');
        none.value = '';
        none.textContent = '目標未指定';
        targetSelect.append(none);
        for (const [i, v] of others.entries()) {
          const option = document.createElement('option');
          option.value = v.id;
          option.textContent = i + 1 + '. ' + v.name;
          targetSelect.append(option);
        }
        targetSignature = signature;
      }
      const target = others.find(v => v.target);
      if (focus === 'target' && !target) {
        focus = 'body';
        extent = null;
      }
      predict.disabled = !target || !!target.stopped;
      stopPlan.disabled = !target || !!target.stopped;
      transferButton.disabled = !target || !!target.stopped;
      compare.disabled = !target || target.stopped || !p?.burnVel;
      if (encounterTarget !== (target?.id ?? null)) {
        encounter = null;
        plannedEncounter = null;
        comparison.textContent = '';
        encounterTarget = target?.id ?? null;
        prediction.textContent = '';
        transferResult.textContent = '';
      }
      targetSelect.value = target?.id || '';
      const grounded = !!getFlight()?.landed,
        launchGuide = grounded && target && !target.stopped ? launchPlaneGuide(o, target.orbit) : null,
        plane = !grounded && target && !target.stopped ? relativeOrbitPlane(o, target.orbit) : null;
      targetText.textContent = target
        ? (target.distance / 1000).toFixed(2) +
          ' km · ' +
          target.speed.toFixed(2) +
          ' m/s' +
          (plane ? ' · 相対傾斜 ' + plane.inclination.toFixed(2) + '°' : '')
        : '';
      launchReadout.hidden = !launchGuide;
      if (launchGuide)
        launchReadout.textContent =
          '現在地点の軌道面ずれ ' +
          launchGuide.error.toFixed(2) +
          '° · ' +
          (launchGuide.status === 'unreachable'
            ? 'この緯度では軌道面を通過しません'
            : (launchGuide.status === 'always'
                ? '常に軌道面上'
                : '次の軌道面通過 ' +
                  Math.floor(launchGuide.wait / 60) +
                  '分 ' +
                  Math.floor(launchGuide.wait % 60) +
                  '秒') +
              (launchGuide.heading === null ? '' : ' · 軌道方向 ' + launchGuide.heading.toFixed(0) + '°'));
      clear.hidden = !target;
      if (current?.bodyId !== o.bodyId) extent = null;
      current = o;
      preview = p;
      draw();
    }
  };
}
export function mountMapPanels() {
  const edit = document.createElement('button');
  edit.id = 'editManeuver';
  edit.textContent = '計画を編集';
  element(document, '#clearManeuver', 'button').before(edit);
  const cancel = document.createElement('button');
  cancel.id = 'cancelManeuverEdit';
  cancel.textContent = '編集を取消';
  cancel.hidden = true;
  element(document, '#fixManeuver', 'button').after(cancel);

  const existing = element(document, '#planDeltaV', 'input'),
    existingText = closest(existing, 'label', 'label').firstChild;
  if (!existingText) throw Error('予定Δvの表示文字が見つかりません');
  existingText.textContent = '順行 / 逆行（m/s）';
  for (const [id, name, title] of [
    ['planNormal', '軌道面 ＋ / −（m/s）', '＋は位置×速度の方向、−はその逆'],
    ['planRadial', '外向き / 内向き（m/s）', '速度に垂直な軌道面内方向。＋外向き、−内向き']
  ]) {
    const label = document.createElement('label');
    label.textContent = name;
    label.title = title;
    const input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.min = String(-10000);
    input.max = String(10000);
    input.step = String(1);
    input.value = String(0);
    label.append(input);
    closest(existing, 'fieldset', 'fieldset').insertBefore(label, document.querySelector('#maneuverResult'));
  }

  const option = document.createElement('option');
  option.value = 'custom';
  option.textContent = 'マップ上の指定地点';
  element(document, '#planLocation', 'select').append(option);
  const readings = element(document, '.mapReadings', 'div'),
    plan = document.createElement('details');
  plan.id = 'mapPlanPanel';
  const label = document.createElement('summary');
  label.textContent = 'マニューバ';
  plan.append(label, ...readings.querySelectorAll('fieldset'));
  readings.prepend(plan);
  const info = document.createElement('details');
  info.id = 'mapOrbitPanel';
  const summary = document.createElement('summary');
  summary.textContent = '軌道情報';
  info.append(summary);
  for (const id of ['orbitPeriod', 'apoapsisPlan', 'periapsisPlan', 'orbitPlanNote'])
    info.append(byId(id, 'p'));
  readings.append(info);
  const headingText = element(document, '.mapHeader h2', 'h2').firstChild;
  if (!headingText) throw Error('軌道マップ見出しの文字が見つかりません');
  headingText.textContent = '';
  element(document, '#closeOrbitMap', 'button').textContent = '飛行へ M';
}

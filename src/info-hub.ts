// The info hub (BACKLOG 7c, moved from app.ts unchanged): updateInfo refreshes the flight and design panels
// (fan-out) and then the design statistics of the workshop or the flight in progress (mass, TWR, Δv, power,
// RCS, fuel feeds, checks and the staging panel). The staging callbacks and the other calls up into app.ts go
// through app-hooks. No import-time side effects.
import {syncEngineShrouds} from './engine-shrouds.js';
import {updateDepartureButton} from './departure-mode.js';
import {updateFlightControls} from './flight-controls.js';
import {formatUniversalTime} from './universal-time.js';
import {moveStage} from './staging.js';
import {renderStagingPanel} from './staging-panel.js';
import {powerTotals} from './power.js';
import {PARTS} from './catalog.js';
import {statistics} from './core.js';
import {fuelNetworks, stagePerformance} from './resources.js';
import {state} from './app-state.js';
import {hooks} from './app-hooks.js';
import {$, errorMessage, notify} from './ui-common.js';
import {objects, editorMarkers} from './scene.js';
import {assets} from './asset-loader.js';
import {updateExploration} from './exploration-ui.js';
import {updateThermalInfo} from './thermal-info.js';
import {workshopOverlays} from './workshop-panels.js';
import {flightPanels, partWindowPanels} from './flight-panels.js';
import {updateTransferGuide} from './flight-hud.js';
/** Fan-out: the flight and design panels, the practice and save labels, the clocks and the thermal panel. */
export function refreshPanels() {
  const {
      maneuverPanel,
      orbitalPanel,
      cruisePanel,
      runwayPanel,
      dockingWindow,
      deliveryPanel,
      buoyancyPanel,
      designDiagnostics,
      departurePanel,
      returnPanel,
      ascentPanel,
      capturePanel,
      descentPanel
    } = flightPanels(),
    {partWindows, designPartWindows} = partWindowPanels();
  if (state.flight) $('#throttleVal', 'b').textContent = Math.round(state.flight.throttle * 100) + '%';
  maneuverPanel.update();
  orbitalPanel.update();
  cruisePanel.update();
  runwayPanel.update();
  syncEngineShrouds(state.flight ? state.flight.parts : state.parts, objects, assets.get('engine-shroud'));
  dockingWindow.update();
  deliveryPanel.update();
  buoyancyPanel.update();
  partWindows.update();
  designPartWindows.update();
  updateExploration();
  $('#practiceNotice', 'span').hidden = !state.practiceSession;
  $('#back', 'button').textContent = state.practiceSession ? '練習終了 · 組立棟へ' : '← 組立棟に戻る';
  $('#quickSave', 'button').textContent = state.practiceSession ? '練習内保存 F5' : '飛行保存 F5';
  $('#quickLoad', 'button').textContent = state.practiceSession ? '練習内復帰 F9' : '飛行復帰 F9';
  updateDepartureButton(document, $('#environment', 'select').value);
  updateFlightControls(document, state.flight);
  designDiagnostics.update();
  departurePanel.update();
  returnPanel.update();
  ascentPanel.update();
  capturePanel.update();
  descentPanel.update();
  updateTransferGuide();
  const clock = formatUniversalTime(state.flight?.universalTime ?? state.universalTime);
  $('#workshopTime', 'p').textContent = clock + (state.flight ? ' · 共通時刻' : ' · 停止中');
  $('#universalTime', 'div').textContent = clock + ' · 宇宙の共通時刻';
  updateThermalInfo();
}
/** Design statistics of the workshop craft or of the flight in progress, the checks and the staging panel. */
export function designStatistics() {
  const {comMarker, aeroMarker} = editorMarkers(),
    {designDiagnostics} = flightPanels();
  const viewParts = state.flight ? state.flight.parts : state.parts;
  const st = state.flight ? state.flight.stats : statistics(state.parts);
  const rcsParts = viewParts.filter(p => PARTS[p.type].monoprop),
    rcsCapacity = rcsParts.reduce((s, p) => s + (PARTS[p.type].monoprop ?? 0), 0),
    shown = state.flight;
  $('#rcsInfo', 'p').textContent = rcsCapacity
    ? 'RCS推進剤 ' +
      (shown ? rcsParts.reduce((s, p) => s + (shown.fuel.get(p.id) || 0), 0).toFixed(2) : rcsCapacity) +
      ' / ' +
      rcsCapacity +
      ' kg · 各ブロック内蔵'
    : '';
  $('#mass', 'b').textContent = (st.mass / 1000).toFixed(2);
  const plan = stagePerformance(
    state.flight ? state.flight.parts : state.parts,
    state.flight?.fuel,
    state.flight?.thermal
  );
  $('#twr', 'b').textContent = (plan[0]?.twr || 0).toFixed(2);
  $('#dv', 'b').textContent = Math.round(plan.reduce((s, p) => s + p.dv, 0)).toLocaleString();
  const power = state.flight
      ? powerTotals(state.flight.parts, state.flight.charge)
      : {capacity: viewParts.reduce((n, p) => n + (PARTS[p.type].battery || 0), 0), stored: null},
    pt = state.flight?.telemetry.power;
  $('#powerInfo', 'p').textContent =
    '電力 ' +
    (power.stored === null ? '容量 ' + power.capacity : power.stored.toFixed(1) + ' / ' + power.capacity) +
    ' EC' +
    (pt
      ? ' · 発電 ' +
        pt.generation.toFixed(2) +
        ' / 消費 ' +
        pt.consumption.toFixed(2) +
        ' EC/s' +
        (pt.eclipse ? ' · 天体の影' : '') +
        (pt.ratio < 0.99 ? ' · ホイール出力低下' : '')
      : '');
  $('#count', 'b').textContent = String((state.flight ? state.flight.parts : state.parts).length);
  comMarker.position.copy(st.com);
  aeroMarker.position.copy(st.aero.center);
  if (state.flight) {
    comMarker.position.applyQuaternion(state.flight.q).add(state.flight.pos);
    aeroMarker.position.applyQuaternion(state.flight.q).add(state.flight.pos);
  }
  $('#aeroInfo', 'p').textContent = st.aero.weight
    ? `翼面積 ${st.aero.area.toFixed(2)} m² · 静安定余裕（近似） ${((st.aero.staticMargin ?? 0) * 100).toFixed(0)}% MAC`
    : st.aero.area
      ? `翼面積 ${st.aero.area.toFixed(2)} m² · 縦向きの翼：水平飛行用の静安定余裕は対象外`
      : '空力部品なし';
  const warnings = [];
  const hasControl = viewParts.some(p => PARTS[p.type].control),
    engines = viewParts.filter(p => PARTS[p.type].thrust),
    roots = viewParts.filter(p => !p.parent);
  warnings.push([hasControl, '制御ユニット' + (hasControl ? '接続済み' : 'がありません')]);
  warnings.push([
    roots.length === 1,
    roots.length === 1 ? '接続ツリー正常' : `独立した機体が ${roots.length} 個あります`
  ]);
  const unfed = fuelNetworks(viewParts)
    .groups.filter(
      g =>
        g.engines.length &&
        !g.tanks.some(t =>
          state.flight ? (state.flight.fuel.get(t.id) || 0) > 0 : (PARTS[t.type].fuel ?? 0) > 0
        )
    )
    .flatMap(g => g.engines);
  if (engines.some(p => PARTS[p.type].thrustMedium !== 'water') && (state.flight || !unfed.length))
    warnings.push([
      !unfed.length,
      unfed.length
        ? '燃料が届かないエンジン ' + unfed.length + '基 · タンクとの接続・分離リングを確認'
        : '全エンジンに燃料供給あり'
    ]);
  if ((state.flight?.environment ?? $('#environment', 'select').value) === 'land' && engines.length)
    warnings.push([
      (plan[0]?.twr || 0) > 1,
      (plan[0]?.twr || 0) > 1 ? '垂直離陸に必要な推力あり' : '垂直離陸には推力が不足'
    ]);
  $('#checks', 'div').innerHTML = warnings
    .map(([ok, s]) => `<div class="check ${ok ? '' : 'warn'}"><i>${ok ? '✓' : '!'}</i>${s}</div>`)
    .join('');
  if (!state.flight && unfed.length) {
    const list = document.createElement('details'),
      summary = document.createElement('summary');
    list.className = 'unfedEngines';
    summary.textContent = '燃料未供給 · ' + unfed.length + '基';
    list.append(summary);
    for (const engine of unfed) {
      const button = document.createElement('button');
      button.textContent = state.parts.indexOf(engine) + 1 + '. ' + PARTS[engine.type].code;
      button.title = PARTS[engine.type].name;
      button.onclick = () => {
        hooks.cancelPlacement();
        hooks.select(engine.id);
        workshopOverlays().fuelOverlay.show(state.parts, engine.id, objects);
        document.getElementById('fuelNetwork')?.setAttribute('aria-pressed', 'true');
        $('#selection', 'div').scrollIntoView({block: 'nearest'});
      };
      list.append(button);
    }
    $('#checks', 'div').append(list);
  }
  const feedParts = state.flight ? state.flight.parts : state.parts,
    feeds = fuelNetworks(feedParts).groups.filter(g => g.engines.length);
  $('#fuelInfo', 'div').innerHTML =
    feeds
      .map(g => {
        const capacity = g.tanks.reduce((s, p) => s + (PARTS[p.type].fuel ?? 0), 0),
          remaining = shown ? g.tanks.reduce((s, p) => s + (shown.fuel.get(p.id) || 0), 0) : capacity;
        return (
          '<div>点火段 ' +
          Math.min(...g.engines.map(p => p.stage)) +
          ' · ' +
          g.engines.length +
          '基 · 燃料 ' +
          Math.round(remaining) +
          ' / ' +
          capacity +
          ' kg</div>'
        );
      })
      .join('') +
    plan
      .map(
        p => '<div>段 ' + p.stage + ' · Δv ' + Math.round(p.dv) + ' m/s · TWR ' + p.twr.toFixed(2) + '</div>'
      )
      .join('');
  renderStagingPanel($('#stages', 'div'), viewParts, {
    flight: state.flight,
    previewStage: designDiagnostics.previewStage,
    onPreview: stage => {
      designDiagnostics.preview(stage);
      updateInfo();
    },
    onSelect: id => {
      hooks.cancelPlacement();
      hooks.select(id);
    },
    onMove: (stage, direction) => {
      if (state.flight) return;
      try {
        const next = moveStage(state.parts, stage, direction);
        hooks.cancelPlacement();
        hooks.checkpoint();
        state.parts = next;
        hooks.rebuild();
        notify('段 ' + stage + ' を ' + (stage + direction) + ' と交換しました');
      } catch (e) {
        notify(errorMessage(e));
      }
    }
  });
}
export function updateInfo() {
  refreshPanels();
  designStatistics();
}

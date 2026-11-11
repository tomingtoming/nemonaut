// Workshop panels: the assembly tree, the interference list with its
// highlight boxes, and the scene overlays they draw into (interference boxes, fuel network). app.ts creates
// the overlays at their original place. Calls up into app.ts through app-hooks. No import-time side effects.
import * as T from 'three';
import {createFuelOverlay, type FuelOverlay} from './fuel-overlay.js';
import {partInterferenceBounds, assemblyInterferences} from './assembly-interference.js';
import {assemblyTree} from './assembly-branch.js';
import {PARTS} from './catalog.js';
import {descendants} from './core.js';
import {state} from './app-state.js';
import {hooks} from './app-hooks.js';
import {$, disposeMaterial} from './ui-common.js';
import {sceneCore} from './scene.js';
import {assetBounds} from './asset-loader.js';
type WorkshopOverlays = {interferenceOverlay: T.Group; fuelOverlay: FuelOverlay};
let overlays: WorkshopOverlays | null = null;
export function createWorkshopOverlays(): WorkshopOverlays {
  const {scene} = sceneCore();
  const interferenceOverlay = new T.Group();
  scene.add(interferenceOverlay);
  const fuelOverlay = createFuelOverlay(scene);
  overlays = {interferenceOverlay, fuelOverlay};
  return overlays;
}
export function workshopOverlays(): WorkshopOverlays {
  if (!overlays) throw Error('組立棟の重ね表示がまだ作られていません');
  return overlays;
}
export function partById<P extends {id: string}>(list: readonly P[], id: string | null | undefined): P {
  const p = list.find(p => p.id === id);
  if (!p) throw Error('部品が見つかりません: ' + id);
  return p;
}
export function renderAssemblyTree() {
  const panel = $('#assemblyTree', 'details'),
    list = $('#assemblyTreeRows', 'ol');
  panel.hidden = !!state.flight;
  const scroll = list.scrollTop;
  list.replaceChildren();
  if (state.flight) return;
  const branch = state.selected ? descendants(state.parts, state.selected) : new Set();
  for (const [index, item] of assemblyTree(state.parts).entries()) {
    const row = document.createElement('li'),
      button = document.createElement('button');
    row.style.paddingLeft = Math.min(item.depth, 12) * 12 + 'px';
    button.textContent =
      index +
      1 +
      '. ' +
      PARTS[item.type].code +
      ' ' +
      PARTS[item.type].name +
      ' · 枝' +
      item.count +
      ' · 段' +
      item.stage;
    button.classList.toggle('branchMember', branch.has(item.id));
    button.setAttribute('aria-pressed', String(item.id === state.selected));
    button.onclick = () => {
      hooks.cancelPlacement();
      hooks.select(item.id);
    };
    row.append(button);
    list.append(row);
  }
  list.scrollTop = scroll;
  $('#assemblyTreeCount', 'b').textContent = String(state.parts.length);
}
export function clearInterferenceHighlight() {
  const {fuelOverlay, interferenceOverlay} = workshopOverlays();
  fuelOverlay.clear();
  document.getElementById('fuelNetwork')?.setAttribute('aria-pressed', 'false');
  for (const o of [...interferenceOverlay.children]) {
    if (o instanceof T.LineSegments) {
      o.geometry.dispose();
      disposeMaterial(o.material);
    }
    interferenceOverlay.remove(o);
  }
  for (const row of document.querySelectorAll('.interferencePairActive'))
    row.classList.remove('interferencePairActive');
}
function showInterferencePair(
  pair: import('./assembly-interference.js').InterferencePair,
  focusId: string,
  row: HTMLElement
) {
  const {interferenceOverlay} = workshopOverlays();
  if (state.flight) return;
  hooks.cancelPlacement();
  hooks.select(focusId);
  for (const [index, id] of [pair.a, pair.b].entries()) {
    const p = state.parts.find(p => p.id === id);
    if (!p) continue;
    for (const box of partInterferenceBounds(p, assetBounds)) {
      const shape = new T.BoxGeometry(...box.half.clone().multiplyScalar(2).toArray()),
        edges = new T.EdgesGeometry(shape);
      shape.dispose();
      const line = new T.LineSegments(
        edges,
        new T.LineBasicMaterial({color: index ? '#55dce8' : '#ff9c56', depthTest: false})
      );
      line.position.copy(box.center);
      line.quaternion.copy(box.quaternion);
      line.renderOrder = 20;
      interferenceOverlay.add(line);
    }
  }
  row.classList.add('interferencePairActive');
}
export function renderInterferences() {
  const list = $('#interferenceRows', 'div');
  list.replaceChildren();
  if (state.flight) return;
  const result = assemblyInterferences(state.parts, assetBounds);
  $('#interferenceCount', 'b').textContent = String(result.total);
  $('#interferenceSummary', 'p').textContent = result.total
    ? result.total +
      ' 組。' +
      (result.total > result.pairs.length ? '先頭 ' + result.pairs.length + ' 組を表示。' : '') +
      '部品名を選ぶと橙・水色の箱で表示します。'
    : '箱同士の明確な重なりはありません。';
  const indices = new Map(state.parts.map((p, i) => [p.id, i + 1]));
  for (const pair of result.pairs) {
    const row = document.createElement('article');
    row.className = 'interferencePair';
    for (const [index, id] of [pair.a, pair.b].entries()) {
      const p = partById(state.parts, id),
        button = document.createElement('button');
      button.textContent =
        (index ? '水色' : '橙') +
        ' ' +
        indices.get(id) +
        '. ' +
        PARTS[p.type].code +
        ' ' +
        PARTS[p.type].name;
      button.onclick = () => showInterferencePair(pair, id, row);
      row.append(button);
    }
    list.append(row);
  }
}

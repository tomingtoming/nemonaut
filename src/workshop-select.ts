import {equipmentSwitches, isEquipmentKey} from './part-settings.js';
// Workshop selection and inspector: selecting a part, the edit
// modes with the transform gizmo, the inspector with pose, stage and equipment settings (linked across a
// symmetry group), deleting a branch. app.ts calls wireSelection at the original place. Calls up into app.ts
// through app-hooks. No import-time side effects.
import {selectReference} from './command-frame.js';
import {PARTS, nodes} from './catalog.js';
import {attachmentProfile} from './attachment-profile.js';
import {attachmentProfileLabel, attachmentSizeLabel} from './attachment-label.js';
import {descendants} from './core.js';
import {occupiedNodes, nodeAvailable, nodeConnection} from './attachment-nodes.js';
import {editSymmetryPose} from './symmetry-geometry.js';
import {symmetryTargets, editSymmetrySetting, normalizeSymmetry, hasSymmetryGeometry} from './symmetry.js';
import {extractBranch} from './assembly-branch.js';
import {fuelNetworks} from './resources.js';
import {syncCargoVisual} from './cargo-geometry.js';
import {showInspector} from './overlay-panels.js';
import {element, elements} from './dom.js';
import {state, type EditMode} from './app-state.js';
import {hooks} from './app-hooks.js';
import {$, $$, dataValue, notify, errorMessage} from './ui-common.js';
import {sceneCore, selectionOverlays, editorMarkers, objects, partObject} from './scene.js';
import {updateWorkshop} from './workshop-bay.js';
import {checkpoint} from './workshop-undo.js';
import {workshopOverlays, clearInterferenceHighlight, renderAssemblyTree} from './workshop-panels.js';
import {cancelPlacement, beginPlacement} from './workshop-place.js';
export function select(id: string | null) {
  const {gizmo} = editorMarkers();
  const {highlight} = selectionOverlays();
  if (id && !state.flight) showInspector();
  clearInterferenceHighlight();
  state.selected = id;
  const o = id === null ? undefined : objects.get(id);
  highlight.visible = !!o && !state.flight;
  if (o) {
    highlight.setFromObject(o);
    if (state.mode !== 'select' && !state.flight) gizmo.attach(o);
    else gizmo.detach();
  } else gizmo.detach();
  renderInspector();
  renderAssemblyTree();
}
export function isEditMode(value: string): value is EditMode {
  return value === 'select' || value === 'translate' || value === 'rotate';
}
export function setMode(next: EditMode) {
  const {gizmo} = editorMarkers();
  state.mode = next;
  cancelPlacement();
  $$('[data-mode]', 'button').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
  if (state.mode !== 'select') gizmo.setMode(state.mode);
  select(state.selected);
}
function renderInspector() {
  const {fuelOverlay} = workshopOverlays();
  fuelOverlay.clear();
  const p = state.parts.find(p => p.id === state.selected),
    root = $('#selection', 'div');
  if (!p) {
    root.innerHTML = '<p class="muted">機体の部品をクリックすると<br>位置・回転・段を編集できます。</p>';
    return;
  }
  const d = PARTS[p.type],
    group = symmetryTargets(state.parts, p.id),
    connection = nodeConnection(state.parts, p),
    usedNodes = occupiedNodes(state.parts),
    openNodes = nodes(p.type).filter((_, i) => nodeAvailable(usedNodes, p.id, i)).length;
  const parent = state.parts.find(part => part.id === p.parent),
    fitLabel =
      connection && parent
        ? attachmentSizeLabel(parent.type, connection.parentNode, p.type, connection.ownNode)
        : '',
    endLabels = [0, 1]
      .map(i => {
        const profile = attachmentProfile(p.type, i);
        return profile ? (i === 0 ? '+Y' : '−Y') + ' ' + attachmentProfileLabel(profile) + ' m' : '';
      })
      .filter(Boolean)
      .join(' · ');
  root.innerHTML = `<div class="parttitle"><b>${d.name}</b><small>${d.code}</small></div><p class="desc">${d.desc}</p>${endLabels ? `<p class="muted" data-stack-diameters>${endLabels}</p>` : ''}<p class="muted">接続点：${openNodes} / ${nodes(p.type).length} 空き${connection ? ` · 親の点${connection.parentNode + 1} ↔ この点${connection.ownNode + 1}${fitLabel ? ` · ${fitLabel}` : ''}` : ''}</p>${group.length > 1 ? `<label class="field">対称 ${group.length} 部品を連動<input id="linkSymmetry" type="checkbox" ${state.linkSymmetry ? 'checked' : ''}></label><p class="muted">${hasSymmetryGeometry(state.parts, p.id) ? '位置・回転・作動段・装備設定を連動。子部品も追従します。' : 'この旧グループは作動段・装備設定のみ連動。位置・回転は個別です。'}</p>` : ''}${equipmentSwitches
    .filter(({capability}) => d[capability])
    .map(
      ({key, label, keys}) =>
        `<label class="field">${keys ? keys + ' ' : ''}${label}<input type="checkbox" data-operation="${key}" ${p[key] !== false ? 'checked' : ''}></label>`
    )
    .join(
      ''
    )}<div class="xyz"><span>m</span>${p.p.map((v, i) => `<input aria-label="位置 ${'XYZ'[i]}" data-field="p" data-axis="${i}" type="number" step="0.1" value="${v.toFixed(2)}">`).join('')}</div><div class="xyz"><span>°</span>${p.r.map((v, i) => `<input aria-label="回転 ${'XYZ'[i]}" data-field="r" data-axis="${i}" type="number" step="15" value="${Math.round((v * 180) / Math.PI)}">`).join('')}</div><label class="field">作動ステージ<select id="partStage">${Array.from({length: 10}, (_, i) => `<option value="${i}" ${p.stage === i ? 'selected' : ''}>${String(i).padStart(2, '0')}</option>`).join('')}</select></label><div class="actions"><button id="duplicate">同じ種類を追加</button><button id="duplicateBranch">枝を複製</button><button id="moveBranch">枝を付け替える</button><button id="deletePart" class="danger">枝 ${descendants(state.parts, p.id).size} 部品を削除</button></div>`;
  const feed = fuelNetworks(state.parts).network.get(p.id);
  if (feed && (feed.engines.length || feed.tanks.length)) {
    const button = document.createElement('button');
    button.id = 'fuelNetwork';
    button.className = 'wide';
    button.textContent = '燃料系統 · ' + feed.tanks.length + 'タンク / ' + feed.engines.length + '基';
    button.setAttribute('aria-pressed', 'false');
    button.title = '水色：タンク · 橙：エンジン · 緑：接続';
    button.onclick = () => {
      const active = button.getAttribute('aria-pressed') !== 'true';
      fuelOverlay.clear();
      if (active) fuelOverlay.show(state.parts, p.id, objects);
      button.setAttribute('aria-pressed', String(active));
    };
    element(root, '.parttitle', 'div').after(button);
  }
  const linked = root.querySelector('#linkSymmetry');
  if (linked instanceof HTMLInputElement)
    linked.onchange = () => {
      state.linkSymmetry = linked.checked;
      renderInspector();
    };
  elements(root, '[data-operation]', 'input').forEach(el => {
    const operation = dataValue(el, 'operation');
    if (!isEquipmentKey(operation)) throw Error('不明な装備設定です: ' + operation);
    const targets = symmetryTargets(state.parts, p.id, state.linkSymmetry);
    el.indeterminate = targets.some(q => (q[operation] !== false) !== (p[operation] !== false));
    el.onchange = () => applySetting(operation, el.checked);
  });
  elements(root, '[data-field]', 'input').forEach(
    el =>
      (el.onchange = () => {
        const v = Number(el.value);
        if (!Number.isFinite(v) || Math.abs(v) > 1000) return;
        try {
          const pose = {position: [...p.p], rotation: [...p.r]};
          pose[el.dataset.field === 'r' ? 'rotation' : 'position'][Number(el.dataset.axis)] =
            el.dataset.field === 'r' ? (v * Math.PI) / 180 : v;
          const next = editSymmetryPose(state.parts, p.id, pose, state.linkSymmetry);
          checkpoint();
          state.parts = next;
          hooks.rebuild();
        } catch (e) {
          notify(errorMessage(e));
          renderInspector();
        }
      })
  );
  if (symmetryTargets(state.parts, p.id, state.linkSymmetry).some(q => q.stage !== p.stage))
    $('#partStage', 'select').insertAdjacentHTML('afterend', '<small>段が混在</small>');
  $('#partStage', 'select').onchange = () => applySetting('stage', +$('#partStage', 'select').value);
  $('#duplicate', 'button').onclick = () => beginPlacement(p.type);
  $('#duplicateBranch', 'button').onclick = () => {
    try {
      beginPlacement(p.type, extractBranch(state.parts, p.id));
    } catch (e) {
      notify(errorMessage(e));
    }
  };
  $('#moveBranch', 'button').onclick = () => {
    try {
      beginPlacement(p.type, extractBranch(state.parts, p.id), true);
    } catch (e) {
      notify(errorMessage(e));
    }
  };
  $('#deletePart', 'button').onclick = deleteSelected;
}
function dragPose() {
  if (!state.selected) throw Error('部品が選択されていません');
  const o = partObject(state.selected);
  return {position: o.position.toArray(), rotation: [o.rotation.x, o.rotation.y, o.rotation.z]};
}
export function applySetting(
  key: string,
  value: boolean | number,
  id = state.selected,
  linked = state.linkSymmetry
) {
  if (state.flight || state.atCenter) return;
  try {
    if (id === null) throw Error('部品が選択されていません');
    const next =
      key === 'referenceDirection'
        ? structuredClone(state.parts)
        : editSymmetrySetting(state.parts, id, key, value, linked);
    if (key === 'referenceDirection') selectReference(next, id, Number(value), PARTS);
    checkpoint();
    state.parts = next;
    if (key === 'cargoOpen')
      for (const p of state.parts) {
        const o = objects.get(p.id);
        if (o) syncCargoVisual(o, p, PARTS[p.type]);
      }
    renderInspector();
    hooks.updateInfo();
    renderAssemblyTree();
  } catch (e) {
    notify(errorMessage(e));
  }
}
export function deleteSelected() {
  if (!state.selected || state.flight) return;
  checkpoint();
  const ids = descendants(state.parts, state.selected);
  state.parts = normalizeSymmetry(state.parts.filter(p => !ids.has(p.id)));
  for (const p of state.parts)
    if (p.dockPartner !== undefined && ids.has(p.dockPartner)) delete p.dockPartner;
  state.selected = null;
  hooks.rebuild();
  notify(`${ids.size} 部品を取り外しました`);
}
export function wireSelection() {
  const {controls} = sceneCore();
  const {gizmo} = editorMarkers();
  const {highlight} = selectionOverlays();
  gizmo.addEventListener('dragging-changed', e => {
    controls.enabled = !e.value;
    if (e.value) {
      state.saveDrag = structuredClone(state.parts);
    } else if (state.saveDrag) {
      try {
        if (!state.selected) throw Error('部品が選択されていません');
        const next = editSymmetryPose(state.saveDrag, state.selected, dragPose(), state.linkSymmetry);
        checkpoint();
        state.parts = next;
      } catch (error) {
        notify(errorMessage(error));
      }
      state.saveDrag = null;
      hooks.rebuild();
    }
  });
  gizmo.addEventListener('objectChange', () => {
    if (state.saveDrag) {
      try {
        if (!state.selected) throw Error('部品が選択されていません');
        for (const p of editSymmetryPose(state.saveDrag, state.selected, dragPose(), state.linkSymmetry)) {
          if (p.id === state.selected) continue;
          const o = partObject(p.id);
          o.position.fromArray(p.p);
          o.rotation.set(...p.r);
        }
      } catch {}
    }
    highlight.update();
    updateWorkshop();
  });
}

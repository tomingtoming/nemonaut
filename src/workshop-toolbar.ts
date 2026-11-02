// Workshop toolbar, craft I/O and parts catalog (BACKLOG 7c, moved from app.ts unchanged): new craft, example
// craft, VAB/SPH bay, markers, edit modes, snap, symmetry, craft JSON save/load/export/import and the catalog
// with categories and search. app.ts calls wireWorkshopToolbar and wireCatalog at their original places.
// Calls up into app.ts through app-hooks. No import-time side effects.
import {storageKey} from './app-id.js';
import {examples, exampleGroups} from './examples.js';
import {mountWorkshopSymmetry, type WorkshopSymmetry} from './workshop-symmetry.js';
import {updateDepartureButton} from './departure-mode.js';
import {PARTS, CATEGORIES, preset, type PartType} from './catalog.js';
import {validateCraft, type CraftRecord} from './core.js';
import {state} from './app-state.js';
import {hooks} from './app-hooks.js';
import {$, $$, dataValue, notify, errorMessage, showModal} from './ui-common.js';
import {editorMarkers, frame} from './scene.js';
import {assetModel} from './asset-loader.js';
import {checkpoint, undo, redo} from './workshop-undo.js';
import {showNodes, cancelPlacement, beginPlacement} from './workshop-place.js';
import {isEditMode, setMode} from './workshop-select.js';
const exampleTable: Record<string, string[]> = examples;
let symmetry: WorkshopSymmetry | null = null;
export function workshopSymmetry(): WorkshopSymmetry {
  if (!symmetry) throw Error('対称配置の操作がまだ作られていません');
  return symmetry;
}
function isPartType(type: string): type is PartType {
  return Object.hasOwn(PARTS, type);
}
function craftData() {
  return {version: 1, name: $('#craftName', 'input').value, parts: structuredClone(state.parts)};
}
export function loadData(data: CraftRecord & {name?: unknown}) {
  const loaded = validateCraft(data);
  checkpoint();
  state.parts = loaded;
  $('#craftName', 'input').value = typeof data.name === 'string' ? data.name.slice(0, 80) : 'Untitled';
  cancelPlacement();
  hooks.rebuild();
  frame();
}
export function setBay(b: string) {
  if (state.flight) return;
  const changed = state.bayMode !== b;
  state.bayMode = b;
  $('#vab', 'button').classList.toggle('active', b === 'vab');
  $('#sph', 'button').classList.toggle('active', b === 'sph');
  if (changed) {
    workshopSymmetry().setBay(b);
    $('#environment', 'select').value = b === 'sph' ? 'runway' : 'land';
  }
  showNodes();
  hooks.updateInfo();
}
export function applySnap() {
  const {gizmo} = editorMarkers();
  gizmo.setTranslationSnap($('#snap', 'input').checked ? 0.25 : null);
  gizmo.setRotationSnap($('#snap', 'input').checked ? Math.PI / 12 : null);
}
export function wireWorkshopToolbar() {
  const {aeroMarker, comMarker} = editorMarkers();
  const newButton = document.createElement('button');
  newButton.className = 'wide';
  newButton.textContent = '＋ 新規機体';
  $('#examples', 'button').after(newButton);
  newButton.onclick = () => {
    if (state.flight) return;
    checkpoint();
    state.parts = [];
    state.selected = null;
    cancelPlacement();
    $('#craftName', 'input').value = 'Untitled / 01';
    hooks.rebuild();
    notify('部品を選び、床面をクリックして最初の部品を置けます');
  };
  $('#examples', 'button').onclick = () => {
    if (state.flight) return;
    let group = state.bayMode === 'sph' ? 'vehicle' : 'rocket';
    function render() {
      const selectedGroup = exampleGroups.find(g => g.id === group);
      if (!selectedGroup) throw Error('見本機の種類が見つかりません: ' + group);
      showModal(
        '<h2>見本機</h2><nav class="exampleGroups" aria-label="見本機の種類">' +
          exampleGroups
            .map(
              g => `<button data-example-group="${g.id}" aria-pressed="${g.id === group}">${g.label}</button>`
            )
            .join('') +
          '</nav><div class="examplegrid">' +
          selectedGroup.keys
            .map(k => {
              const v = exampleTable[k];
              return `<button data-example="${k}"><b>${v[1]}</b><span>${v[0]}<br>${v[2]}</span></button>`;
            })
            .join('') +
          '</div>'
      );
      $$('[data-example-group]', 'button').forEach(
        b =>
          (b.onclick = () => {
            group = dataValue(b, 'exampleGroup');
            render();
          })
      );
      $$('[data-example]', 'button').forEach(
        b =>
          (b.onclick = () => {
            const k = dataValue(b, 'example');
            checkpoint();
            state.parts = preset(k);
            $('#craftName', 'input').value = exampleTable[k][0];
            setBay(
              [
                'plane',
                'transport',
                'transport-cargo',
                'boat',
                'sub',
                'plane-large',
                'boat-large',
                'sub-large',
                'rover',
                'courier'
              ].includes(k)
                ? 'sph'
                : 'vab'
            );
            $('#environment', 'select').value = exampleTable[k][3];
            $('#targetPractice', 'select').value = exampleTable[k][4] === 'rendezvous' ? 'rendezvous' : '';
            updateDepartureButton(document, $('#environment', 'select').value);
            state.selected = null;
            cancelPlacement();
            hooks.rebuild();
            frame();
            $('#modal', 'dialog').close();
          })
      );
    }
    render();
  };
  $('#aero', 'button').onclick = () => {
    aeroMarker.visible = !aeroMarker.visible;
    $('#aero', 'button').classList.toggle('active', aeroMarker.visible);
  };
  $('#trim', 'input').oninput = () => {
    const trim = $('#trim', 'input');
    if (state.flight) state.flight.trim = +trim.value / 100;
    $('#trimVal', 'b').textContent = trim.value + '%';
  };
  symmetry = mountWorkshopSymmetry($('#symmetry', 'select'), $('#symmetryMode', 'button'));
  $('#vab', 'button').onclick = () => setBay('vab');
  $('#sph', 'button').onclick = () => setBay('sph');
  $('#frame', 'button').onclick = frame;
  $('#com', 'button').onclick = () => {
    comMarker.visible = !comMarker.visible;
    $('#com', 'button').classList.toggle('active', comMarker.visible);
  };
  $('#undo', 'button').onclick = undo;
  $('#redo', 'button').onclick = redo;
  $$('[data-mode]', 'button').forEach(
    b =>
      (b.onclick = () => {
        const next = dataValue(b, 'mode');
        if (!isEditMode(next)) throw Error('不明な編集モードです: ' + next);
        setMode(next);
      })
  );
  $('#attach', 'select').onchange = showNodes;
  $('#snap', 'input').onchange = applySnap;
  applySnap();
  $('#environment', 'select').onchange = hooks.updateInfo;
  $('#save', 'button').onclick = () => {
    try {
      localStorage.setItem(storageKey('craft'), JSON.stringify(craftData()));
      notify('このブラウザに機体を保存しました');
    } catch {
      notify('保存できませんでした。JSON出力を使ってください。');
    }
  };
  $('#load', 'button').onclick = () => {
    if (state.flight) return;
    try {
      const s = localStorage.getItem(storageKey('craft'));
      if (!s) {
        notify('保存された機体がありません');
        return;
      }
      loadData(JSON.parse(s));
      notify('保存した機体を読み込みました');
    } catch (e) {
      notify(errorMessage(e));
    }
  };
  $('#export', 'button').onclick = () => {
    const a = document.createElement('a');
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(craftData(), null, 2)], {type: 'application/json'})
    );
    a.href = url;
    a.download = ($('#craftName', 'input').value.replace(/[^\p{L}\p{N}_-]/gu, '_') || 'craft') + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  $('#import', 'button').onclick = () => {
    if (!state.flight) $('#file', 'input').click();
  };
  $('#file', 'input').onchange = async () => {
    try {
      const files = $('#file', 'input').files;
      if (!files) throw Error('ファイルを読み込めません');
      const file = files[0];
      if (!file) return;
      if (file.size > 1000000) throw Error('機体ファイルが大きすぎます');
      loadData(JSON.parse(await file.text()));
      notify('機体を読み込みました');
    } catch (e) {
      notify(errorMessage(e));
    }
    $('#file', 'input').value = '';
  };
}
export function catalog() {
  const q = $('#search', 'input').value.toLowerCase();
  $('#parts', 'div').innerHTML = Object.entries(PARTS)
    .filter(
      ([k, d]) =>
        (state.category === 'すべて' || state.category === d.cat) &&
        `${d.name} ${d.code} ${k}`.toLowerCase().includes(q)
    )
    .map(
      ([k, d]) =>
        `<button class="partcard" data-type="${k}" title="${d.desc}"><span class="partcode">${d.code}</span><em>+</em><img src="${assetModel(k).userData.thumbnail}" alt=""><strong>${d.name}</strong></button>`
    )
    .join('');
  $$('.partcard', 'button').forEach(
    b =>
      (b.onclick = () => {
        const type = dataValue(b, 'type');
        if (!isPartType(type)) throw Error('不明な部品です: ' + type);
        beginPlacement(type);
      })
  );
}
export function wireCatalog() {
  $('#categories', 'div').innerHTML = CATEGORIES.map(
    c => `<button ${c === state.category ? 'class="active"' : ''}>${c}</button>`
  ).join('');
  $$('#categories button', 'button').forEach(
    b =>
      (b.onclick = () => {
        state.category = b.textContent;
        $$('#categories button', 'button').forEach(x => x.classList.toggle('active', x === b));
        catalog();
      })
  );
  $('#search', 'input').oninput = catalog;
}

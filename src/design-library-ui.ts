// Design library dialogs (BACKLOG 7c, moved from app.ts unchanged): the stored designs in this browser, saving
// the workshop design and the launch library of the pad, runway and workshop. Calls up into app.ts through
// app-hooks. No import-time side effects.
import {storageKey} from './app-id.js';
import {DESIGN_LIBRARY_KEY, readDesignLibrary, appendDesign, designForLaunch} from './design-library.js';
import {validateCraft} from './core.js';
import {updateDepartureButton} from './departure-mode.js';
import {state} from './app-state.js';
import {hooks} from './app-hooks.js';
import {$, errorMessage, notify, showModal} from './ui-common.js';
export function loadDesigns(): import('./design-library.js').DesignLibrary {
  const raw = localStorage.getItem(DESIGN_LIBRARY_KEY);
  if (raw) {
    if (raw.length > 12000000) throw Error('設計一覧が大きすぎます');
    return readDesignLibrary(JSON.parse(raw));
  }
  const legacy = localStorage.getItem(storageKey('craft'));
  if (!legacy) return {version: 1, designs: []};
  const old = JSON.parse(legacy);
  return appendDesign(
    {version: 1, designs: []},
    {
      name: typeof old.name === 'string' ? old.name : '以前の保存',
      parts: validateCraft(old),
      bay: 'vab',
      environment: 'land'
    },
    'legacy',
    0
  );
}
export function saveDesign() {
  try {
    const library = appendDesign(loadDesigns(), {
      name: $('#craftName', 'input').value,
      parts: state.parts,
      bay: state.bayMode,
      environment: $('#environment', 'select').value
    });
    localStorage.setItem(DESIGN_LIBRARY_KEY, JSON.stringify(library));
    if (state.atCenter) hooks.refreshCenter();
    notify('設計一覧に新しい版を保存しました · ' + library.designs.length + '件');
    return true;
  } catch (e) {
    notify('保存できませんでした：' + errorMessage(e));
    return false;
  }
}
export function openLaunchLibrary(facility: string) {
  try {
    const library = loadDesigns();
    showModal(
      '<div class="eyebrow">LAUNCH OPERATIONS</div><h2>' +
        (facility === 'workshop' ? '保存した設計' : facility === 'pad' ? '発射台' : '滑走路') +
        '</h2><p>保存した設計の版を選びます。作業中の設計は保持されます。</p><button id="saveDraftToLibrary">作業中の設計を一覧に保存</button><div id="launchDesignRows"></div>'
    );
    $('#saveDraftToLibrary', 'button').onclick = () => {
      if (saveDesign()) openLaunchLibrary(facility);
      else {
        const message = document.createElement('p');
        message.textContent =
          '保存できませんでした。機体が空でないか、ブラウザの保存容量を確認してください。';
        $('#launchDesignRows', 'div').prepend(message);
      }
    };
    const list = $('#launchDesignRows', 'div');
    if (!library.designs.length) {
      const empty = document.createElement('p');
      empty.textContent = 'まだ保存した設計がありません。上のボタンで現在の設計を保存できます。';
      list.append(empty);
    }
    for (const design of [...library.designs].reverse()) {
      const row = document.createElement('article');
      row.className = 'facilityRow';
      const name = document.createElement('strong'),
        info = document.createElement('p'),
        button = document.createElement('button');
      name.textContent = design.name;
      info.textContent =
        design.parts.length +
        '部品 · ' +
        design.bay.toUpperCase() +
        ' · ' +
        (design.savedAt ? new Date(design.savedAt).toLocaleString() : '以前の保存');
      button.textContent =
        facility === 'workshop' ? '設計を読み込む' : facility === 'pad' ? '発射台から出発' : '滑走路から出発';
      button.onclick = () => {
        if (facility === 'workshop') {
          if (state.flight) return;
          $('#modal', 'dialog').close();
          hooks.loadData({version: 1, name: design.name, parts: design.parts});
          hooks.setBay(design.bay);
          $('#environment', 'select').value = design.environment;
          updateDepartureButton(document, design.environment);
          hooks.persistWorkspace();
        } else launchStoredDesign(library, design.id, facility);
      };
      row.append(name, info, button);
      list.append(row);
    }
  } catch (e) {
    $('#centerNotice', 'p').textContent = '設計一覧を開けませんでした：' + errorMessage(e);
  }
}
function launchStoredDesign(
  library: import('./design-library.js').DesignLibrary,
  id: string,
  facility: string
) {
  try {
    hooks.launchAdditional(designForLaunch(library, id, facility));
  } catch (e) {
    $('#centerNotice', 'p').textContent = errorMessage(e);
  }
}

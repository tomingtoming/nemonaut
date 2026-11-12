// The action group selectors of a part window (workshop settings window and flight operation window):
// one row per operation the part offers, each with a selector 「なし, 1…9, 0」. No import-time side effects.
import {ACTION_GROUPS, partOperations} from './action-groups.js';

export interface GroupRowControl {
  select: HTMLSelectElement;
  state: HTMLElement;
}
export type GroupRowChange = (operation: string, group: number | null) => void;
const SEVERAL = 'several';
/** Appends the section; returns the selector of each operation (empty for a part without operations). */
export function mountGroupRows(
  content: HTMLElement,
  type: string,
  change: GroupRowChange
): Map<string, GroupRowControl> {
  const rows = new Map<string, GroupRowControl>(),
    operations = partOperations(type);
  if (!operations.length) return rows;
  const box = document.createElement('div'),
    heading = document.createElement('small');
  box.className = 'groupRows';
  heading.textContent = 'アクショングループ';
  heading.title = '飛行中、割り当てた番号のキー（1〜9・0）で作動します';
  box.append(heading);
  for (const o of operations) {
    const label = document.createElement('label'),
      name = document.createElement('span'),
      state = document.createElement('small'),
      select = document.createElement('select');
    name.append(o.name, state);
    select.className = 'groupSelect';
    select.dataset.operation = o.id;
    select.setAttribute('aria-label', o.name + ' のグループ');
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'なし';
    select.append(none);
    for (const group of ACTION_GROUPS) {
      const option = document.createElement('option');
      option.value = option.textContent = String(group);
      select.append(option);
    }
    label.append(name, select);
    box.append(label);
    rows.set(o.id, {select, state});
    select.onchange = () => {
      if (select.value !== SEVERAL) change(o.id, select.value === '' ? null : Number(select.value));
      // Focus goes back to the page, so the digit keys fire groups again instead of picking options.
      select.blur();
    };
  }
  content.append(box);
  return rows;
}
/** Shows the groups of an operation; `mixed` marks symmetric counterparts that differ. */
export function showGroupRow(
  {select, state}: GroupRowControl,
  groups: readonly number[],
  mixed = false
): void {
  // Left alone while it has focus: the player may be choosing in it.
  if (select.ownerDocument.activeElement === select) return;
  const several = select.querySelector('option[value="' + SEVERAL + '"]');
  if (groups.length > 1) {
    // More than one group (not offered here, but valid in a save) is shown, not edited.
    const option = several ?? document.createElement('option');
    if (option instanceof HTMLOptionElement) {
      option.value = SEVERAL;
      option.textContent = groups.join(' · ');
      option.disabled = true;
    }
    if (!several) select.append(option);
    select.value = SEVERAL;
  } else {
    several?.remove();
    select.value = groups.length ? String(groups[0]) : '';
  }
  const text = mixed ? '混在' : '';
  if (state.textContent !== text) state.textContent = text;
}

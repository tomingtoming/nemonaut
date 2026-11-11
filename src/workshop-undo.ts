// Workshop undo: snapshots of the design (parts, name, bay,
// environment) with an undo and a redo stack of 60 entries. Calls up into app.ts through app-hooks.
// No import-time side effects.
import {state} from './app-state.js';
import {hooks} from './app-hooks.js';
import {$, notify} from './ui-common.js';
const history: string[] = [],
  future: string[] = [];
export function snapshot() {
  return JSON.stringify({
    parts: state.parts,
    name: $('#craftName', 'input').value,
    bay: state.bayMode,
    environment: $('#environment', 'select').value
  });
}
function restoreWorkshopSnapshot(raw: string) {
  const draft = JSON.parse(raw);
  hooks.cancelPlacement();
  state.parts = draft.parts;
  $('#craftName', 'input').value = draft.name;
  hooks.setBay(draft.bay);
  $('#environment', 'select').value = draft.environment;
  hooks.rebuild();
}
export function checkpoint() {
  history.push(snapshot());
  if (history.length > 60) history.shift();
  future.length = 0;
}
export function undo() {
  const previous = history.at(-1);
  if (previous === undefined || state.flight) return;
  future.push(snapshot());
  history.pop();
  restoreWorkshopSnapshot(previous);
  notify('元に戻しました');
}
export function redo() {
  const next = future.at(-1);
  if (next === undefined || state.flight) return;
  history.push(snapshot());
  future.pop();
  restoreWorkshopSnapshot(next);
}

// Thermal panel: heat-shield ablator summary and the hottest parts
// of the flight in progress. No import-time side effects.
import {PARTS} from './catalog.js';
import type {Flight, FlightPart} from './core.js';
import {state} from './app-state.js';
import {$} from './ui-common.js';
import {element, setText} from './dom.js';
function thermalState(f: Flight, id: string) {
  const heat = f.thermal.get(id);
  if (!heat) throw Error('部品の熱状態が見つかりません: ' + id);
  return heat;
}
let wired = false;
/** Refreshes the panel while it is open; a closed panel is brought up to date as it opens. */
export function updateThermalInfo() {
  const panel = $('#thermalPanel', 'details');
  if (!wired) {
    wired = true;
    // The click comes before the panel opens, so it opens on current values; toggle covers the rest.
    element(panel, 'summary', 'summary').addEventListener('click', render);
    panel.addEventListener('toggle', () => {
      if (panel.open) render();
    });
  }
  if (panel.open) render();
}
function render() {
  const heated = state.flight,
    current = heated ? heated.parts : state.parts,
    shields = current.filter(p => PARTS[p.type].heatShield),
    capacity = shields.reduce((n, p) => n + (PARTS[p.type].ablator ?? 0), 0),
    remaining = heated ? shields.reduce((n, p) => n + thermalState(heated, p.id).ablator, 0) : capacity,
    list = $('#thermalParts', 'div');
  setText(
    $('#thermalSummary', 'p'),
    capacity ? '消耗材 ' + remaining.toFixed(2) + ' / ' + capacity + ' kg' : '熱シールド未搭載'
  );
  if (!heated) {
    if (list.firstChild) list.replaceChildren();
    return;
  }
  const ordered = [...current].sort((a, b) => {
    const ratio = (p: FlightPart) =>
      thermalState(heated, p.id).temperature / (PARTS[p.type].maxTemperature || 1100);
    return ratio(b) - ratio(a);
  });
  // One row per part, hottest first; rows are kept and rewritten only where they change.
  const rows = list.children;
  while (rows.length > ordered.length) rows[rows.length - 1].remove();
  ordered.forEach((p, i) => {
    const heat = thermalState(heated, p.id),
      limit = PARTS[p.type].maxTemperature || 1100,
      row = rows[i] ?? list.appendChild(document.createElement('div')),
      className = 'thermalRow' + (heat.failed ? ' failed' : heat.temperature / limit > 0.8 ? ' hot' : '');
    if (row.className !== className) row.className = className;
    setText(
      row,
      PARTS[p.type].code +
        ' · ' +
        heat.temperature.toFixed(0) +
        ' / ' +
        limit +
        ' K' +
        (heat.failed ? ' · 熱損傷' : heated.telemetry.thermal?.parts.get(p.id)?.shielded ? ' · 遮熱中' : '')
    );
  });
}

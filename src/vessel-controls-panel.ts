// 「この機体で使える操作」 (BACKLOG 9a): a small collapsible box in the flight HUD under the quick navigation,
// listing the controls derived from the piloted vessel's parts (vessel-controls.ts) — key names with a
// keyboard, on-screen names on touch. Open at launch unless the viewer collapsed it before (remembered per
// browser). A periodic check re-renders it when the vessel changes (staging, switching, docking) and keeps it
// between the quick navigation and the controls below it. No import-time side effects; app.ts mounts it.
import {state} from './app-state.js';
import {storageKey} from './app-id.js';
import {vesselControls} from './vessel-controls.js';

const COLLAPSED_KEY = storageKey('vesselControlsCollapsed');
const readCollapsed = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
};
const writeCollapsed = (collapsed: boolean): void => {
  try {
    if (collapsed) globalThis.localStorage?.setItem(COLLAPSED_KEY, '1');
    else globalThis.localStorage?.removeItem(COLLAPSED_KEY);
  } catch {}
};
// Controls the box must stay above (when they are on the same side of the screen).
const BELOW = ['#touchFlight .touchRcs', '#touchStick', '#stageDock', '.navpanel', '.flightbottom'];

export function mountVesselControls(hud: HTMLElement, body: HTMLElement = document.body): HTMLDetailsElement {
  const box = document.createElement('details'),
    summary = document.createElement('summary'),
    list = document.createElement('dl');
  box.id = 'vesselControls';
  summary.textContent = 'この機体で使える操作';
  box.append(summary, list);
  box.hidden = true;
  hud.append(box);
  box.addEventListener('toggle', () => {
    if (!box.hidden) writeCollapsed(!box.open);
  });
  let shown = '',
    flying = false;
  const place = () => {
    const nav = document.getElementById('flightQuickNav'),
      top = nav ? nav.getBoundingClientRect().bottom + 8 : 228,
      left = nav ? nav.getBoundingClientRect().left : 12,
      // On touch the rows read in one line each where the screen is wide enough (landscape).
      width = Math.max(
        nav?.getBoundingClientRect().width ?? 0,
        body.classList.contains('touch') ? Math.min(340, innerWidth * 0.4) : 200
      );
    let limit = innerHeight - 8;
    for (const selector of BELOW)
      for (const e of document.querySelectorAll(selector)) {
        const r = e.getBoundingClientRect();
        if (r.width && r.height && r.top >= top && r.left < left + width && r.right > left)
          limit = Math.min(limit, r.top - 8);
      }
    box.style.top = top + 'px';
    box.style.left = left + 'px';
    box.style.width = width + 'px';
    box.style.maxHeight = Math.max(44, limit - top) + 'px';
  };
  const refresh = () => {
    const f = state.flight;
    if (!f || state.atCenter || !body.classList.contains('flying')) {
      box.hidden = true;
      flying = false;
      shown = '';
      return;
    }
    const touch = body.classList.contains('touch'),
      key = [
        touch,
        f.vesselId,
        f.stage,
        f.parts.map(p => p.type + p.stage + (p.driveEnabled ?? '')).join()
      ].join('|');
    if (!flying) {
      // A new flight opens the box unless the viewer collapsed it before.
      flying = true;
      box.hidden = false;
      box.open = !readCollapsed();
    }
    if (key !== shown) {
      shown = key;
      list.replaceChildren(
        ...vesselControls(f.parts, {touch, stage: f.stage}).flatMap(row => {
          const dt = document.createElement('dt'),
            dd = document.createElement('dd');
          dt.textContent = row.action;
          dd.textContent = row.how;
          return [dt, dd];
        })
      );
    }
    place();
  };
  setInterval(refresh, 250);
  return box;
}

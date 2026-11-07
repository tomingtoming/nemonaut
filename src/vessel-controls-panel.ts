// 「この機体で使える操作」 (BACKLOG 9a): a small collapsible box in the flight HUD under the quick navigation,
// listing the controls derived from the piloted vessel's parts (vessel-controls.ts) — key names with a
// keyboard, on-screen names on touch. At launch it opens on a desktop and starts collapsed on touch, where
// the screen is small; once the viewer opens or collapses it, that choice is remembered per
// browser. A periodic check re-renders it when the vessel changes (staging, switching, docking) and keeps it
// between the quick navigation and the controls below it. No import-time side effects; app.ts mounts it.
import {state} from './app-state.js';
import {storageKey} from './app-id.js';
import {vesselControls} from './vessel-controls.js';

const COLLAPSED_KEY = storageKey('vesselControlsCollapsed');
/** The viewer's last choice: true collapsed, false open, null none yet. */
const readCollapsed = (): boolean | null => {
  try {
    const value = globalThis.localStorage?.getItem(COLLAPSED_KEY);
    return value === '1' ? true : value === '0' ? false : null;
  } catch {
    return null;
  }
};
const writeCollapsed = (collapsed: boolean): void => {
  try {
    globalThis.localStorage?.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
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
        f.driveEnabled,
        f.steeringEnabled,
        f.parts.map(p => p.type + p.stage + (p.driveEnabled ?? '') + ':' + (p.steeringEnabled ?? '')).join()
      ].join('|');
    if (!flying) {
      // A new flight: the viewer's last choice, else open on a desktop and collapsed on touch.
      flying = true;
      box.hidden = false;
      box.open = !(readCollapsed() ?? touch);
    }
    if (key !== shown) {
      shown = key;
      list.replaceChildren(
        ...vesselControls(f.parts, {
          touch,
          stage: f.stage,
          driveEnabled: f.driveEnabled,
          steeringEnabled: f.steeringEnabled
        }).flatMap(row => {
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

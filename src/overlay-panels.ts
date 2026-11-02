import {element, byId} from './dom.js';
const panels = new Map<string, (open: boolean) => void>();
export const showInspector = (): void => {
  const set = panels.get('inspector');
  if (!set) throw Error('機体パネルが見つかりません');
  set(true);
};
// Panels float over the world; opening one never resizes the camera viewport.
const dock = document.createElement('div');
dock.id = 'panelDock';
for (const [id, label, closed] of [
  ['library', '部品', false],
  ['inspector', '機体', true]
] as const) {
  const panel = byId(id, 'aside'),
    button = document.createElement('button');
  button.textContent = label;
  button.setAttribute('aria-controls', id);
  const set = (open: boolean) => {
    document.body.classList.toggle(id + '-closed', !open);
    button.setAttribute('aria-expanded', String(open));
    panel.inert = !open;
  };
  panels.set(id, set);
  button.onclick = () => set(button.getAttribute('aria-expanded') !== 'true');
  set(!closed);
  dock.append(button);
}
document.body.append(dock);
const operations = document.createElement('details');
operations.id = 'centerRecords';
const summary = document.createElement('summary');
summary.textContent = '運用';
operations.append(summary);
const sidebar = element(document, '.centerSidebar', 'aside');
for (const node of [
  byId('centerGuide', 'ol'),
  element(document, '.centerSession', 'div'),
  byId('worldHistory', 'details')
])
  operations.append(node);
sidebar.append(operations);

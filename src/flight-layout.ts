import {mountKspLayout} from './ksp-layout.js';
import {element, byId, closest} from './dom.js';
// Reuse the existing controls and event handlers across workshop/flight views.
export function mountFlightLayout(): void {
  const header = element(document, 'header', 'header'),
    right = header.querySelector('.headright');
  const name = element(document, '#craftName', 'input');
  header.insertBefore(name, right);
  const files = document.createElement('div');
  files.className = 'craftFiles';
  for (const id of ['save', 'load', 'examples']) files.append(byId(id, 'button'));
  header.insertBefore(files, right);

  const inspector = element(document, '#inspector', 'aside'),
    orbit = element(document, '.orbitpanel', 'div');
  orbit.classList.add('flightNavigation');
  element(inspector, '.panelhead', 'div').after(orbit);
  for (const id of ['descentPanel', 'capturePanel', 'transferPanel'])
    inspector.insertBefore(byId(id, 'section'), orbit);
  for (const id of ['transferPanel', 'capturePanel', 'descentPanel']) {
    const panel = byId(id, 'section'),
      help = panel.querySelector(':scope > small');
    if (help) {
      const details = document.createElement('details');
      details.className = 'flightHelp';
      const summary = document.createElement('summary');
      summary.textContent = '操作手順と計器の前提';
      details.append(summary, help);
      panel.append(details);
    }
  }
  const warpHelp = document.createElement('details');
  warpHelp.className = 'flightHelp';
  warpHelp.innerHTML = '<summary>時間倍率の条件</summary>';
  for (const el of [...orbit.children]) if (el.tagName === 'SMALL' && !el.id) warpHelp.append(el);
  orbit.append(warpHelp);
  const navigation = document.createElement('div');
  navigation.id = 'flightQuickNav';
  const warp = element(document, '#warp', 'select'),
    status = element(document, '#warpStatus', 'small'),
    inspect = status.nextElementSibling;
  navigation.append(
    element(document, '#openOrbitMap', 'button'),
    closest(warp, 'label', 'label'),
    element(document, '#orbitInfo', 'b'),
    element(document, '#maneuverHud', 'small'),
    status
  );
  if (inspect?.tagName === 'BUTTON') navigation.append(inspect);
  element(document, '#flightHud', 'div').append(navigation);
  const bottom = element(document, '.flightbottom', 'div'),
    extra = document.createElement('details');
  extra.className = 'flightExtra';
  extra.innerHTML = '<summary>駆動系・トリム・キー操作</summary><div class="flightExtraBody"></div>';
  const extraBody = element(extra, '.flightExtraBody', 'div');
  for (const el of [...bottom.children])
    if (
      el.tagName === 'LABEL' ||
      el.tagName === 'SPAN' ||
      el.id === 'actuatorControls' ||
      el.id === 'aeroFlight'
    )
      extraBody.append(el);
  bottom.append(extra);
  element(document, '#thermalPanel', 'details').open = false;
  mountKspLayout();
}

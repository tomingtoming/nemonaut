// Touch smoke check (BACKLOG 8): drives the game as a phone (touch, no mouse or keyboard) in landscape
// and portrait, taps through the main path and saves a screenshot of each screen. Fails on a console
// error, a missing result, horizontal overflow, or when body.touch is not set.
// Usage: node tools/smoke-touch.mjs <url> [screenshot dir]
// Needs the playwright library (PLAYWRIGHT_MODULE = path or file URL of playwright/index.mjs when it
// is not installed in this repository) and Chrome (PLAYWRIGHT_CHANNEL, default 'chrome').
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [url, outDir = 'smoke-touch'] = process.argv.slice(2);
if (!url) throw Error('usage: node tools/smoke-touch.mjs <url> [screenshot dir]');
const spec = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const {chromium, devices} = await import(/^[A-Za-z]:|^\//.test(spec) ? pathToFileURL(spec).href : spec);
mkdirSync(outDir, {recursive: true});

let failed = 0;
const expect = (label, ok, value) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${value}`);
  if (!ok) failed = 1;
};
const browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome'});
for (const name of ['Pixel 7 landscape', 'Pixel 7']) {
  const context = await browser.newContext({...devices[name]});
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', e => errors.push(e.message));
  const shot = file => page.screenshot({path: path.join(outDir, `${name.replace(/\s+/g, '-')}-${file}.png`)});
  const tag = name.includes('landscape') ? 'landscape' : 'portrait';
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{x, y, id: 1}]});
  // Part windows (8c): a long press on the canvas over a part opens the part window (right click on desktop).
  const partWindows = host =>
    page.evaluate(h => document.querySelectorAll(`#${h} .floatingWindow`).length, host);
  const closePartWindows = host =>
    page.evaluate(
      h =>
        document.querySelectorAll(`#${h} .floatingWindow header button:last-child`).forEach(b => b.click()),
      host
    );
  // The craft's screen point is not exposed: try canvas points nearest the canvas centre (only where the
  // canvas itself is on top) until a long press opens a window.
  const longPressPart = async host => {
    const points = await page.evaluate(() => {
      const c = document.getElementById('scene').getBoundingClientRect(),
        cx = c.left + c.width / 2,
        cy = c.top + c.height / 2,
        out = [];
      for (let x = c.left + 10; x < c.right; x += 10)
        for (let y = c.top + 10; y < c.bottom; y += 10)
          if (document.elementFromPoint(x, y)?.id === 'scene') out.push([x, y]);
      return out.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
    });
    for (const [i, [x, y]] of points.slice(0, 40).entries()) {
      await touch('touchStart', x, y);
      await page.waitForTimeout(700);
      const during = await partWindows(host);
      await touch('touchEnd', x, y);
      await page.waitForTimeout(300);
      if (during > 0 && (await partWindows(host)) > 0) return {x, y, tries: i + 1};
    }
    return null;
  };
  const shortTap = async (x, y) => {
    await touch('touchStart', x, y);
    await page.waitForTimeout(80);
    await touch('touchEnd', x, y);
    await page.waitForTimeout(700);
  };
  // Layout (8e): the key controls of a screen do not overlap each other and lie inside the viewport, and
  // the visible buttons in its key panels are at least 40 px in both directions (touch targets).
  const checkLayout = async (screen, keys, panels) => {
    const r = await page.evaluate(
      ({keys, panels}) => {
        const shown = e => {
          const b = e.getBoundingClientRect(),
            cs = getComputedStyle(e);
          return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden]');
        };
        const boxes = keys.flatMap(k =>
          [...document.querySelectorAll(k)]
            .filter(shown)
            .map((e, i) => ({k: k + (i ? '#' + i : ''), b: e.getBoundingClientRect()}))
        );
        const overlaps = [];
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i].b,
              c = boxes[j].b;
            if (
              Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 &&
              Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1
            )
              overlaps.push(boxes[i].k + ' x ' + boxes[j].k);
          }
        const outside = boxes
          .filter(
            ({b}) => b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1
          )
          .map(({k}) => k);
        const small = panels.flatMap(p =>
          [...document.querySelectorAll(p + ' :is(button,summary)')]
            .filter(
              e => shown(e) && (e.getBoundingClientRect().width < 40 || e.getBoundingClientRect().height < 40)
            )
            .map(e => {
              const b = e.getBoundingClientRect();
              return `${p} "${(e.textContent ?? '').trim().slice(0, 12)}" ${Math.round(b.width)}x${Math.round(b.height)}`;
            })
        );
        return {count: boxes.length, overlaps, outside, small};
      },
      {keys, panels}
    );
    expect(
      `${tag} ${screen} key controls do not overlap (${r.count})`,
      r.overlaps.length === 0,
      r.overlaps.join(', ') || 0
    );
    expect(
      `${tag} ${screen} key controls inside the viewport`,
      r.outside.length === 0,
      r.outside.join(', ') || 0
    );
    expect(
      `${tag} ${screen} touch targets >= 40 px`,
      r.small.length === 0,
      r.small.slice(0, 8).join(', ') || 0
    );
  };
  const selectedPart = () => page.evaluate(() => !!document.querySelector('#selection .parttitle'));
  await page.goto(url);
  await page.waitForTimeout(7000);
  const layout = () =>
    page.evaluate(() => ({
      touch: document.body.classList.contains('touch'),
      overflow: document.documentElement.scrollWidth > innerWidth
    }));
  let l = await layout();
  expect(`${tag} body.touch`, l.touch, l.touch);
  expect(`${tag} center no overflow`, !l.overflow, l.overflow);
  await shot('center');
  await checkLayout('center', ['.centerSidebar', '.centerFacilityCard', '#audioButton'], []);
  await page.tap('#enterVAB');
  await page.waitForTimeout(3000);
  l = await layout();
  expect(`${tag} workshop no overflow`, !l.overflow, l.overflow);
  await shot('workshop');
  await checkLayout(
    'workshop',
    [
      'header nav',
      'header>#craftName',
      '.craftFiles',
      '.headright',
      '#panelDock button',
      '.viewactions',
      '#library',
      '#toolbar',
      '#stageDock',
      '#audioButton'
    ],
    ['header', '#panelDock', '.viewactions', '#categories', '#toolbar', '#stageDock']
  );
  // ≤600 px hides the file buttons on the desktop layout; on touch they stay reachable.
  const files = await page.evaluate(() =>
    ['save', 'load', 'examples'].map(id => {
      const e = document.getElementById(id),
        b = e?.getBoundingClientRect(),
        top = b && b.width > 0 && document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return `${id}:${!!top && !!e?.contains(top) && b.right <= innerWidth && b.bottom <= innerHeight}`;
    })
  );
  expect(
    `${tag} save/load/examples reachable`,
    files.every(f => f.endsWith('true')),
    files.join(' ')
  );
  const selectedBefore = await selectedPart();
  const designHit = await longPressPart('designPartWindows');
  expect(`${tag} workshop long press opens a design part window`, !!designHit, JSON.stringify(designHit));
  if (designHit) {
    await shot('workshop-partwindow');
    expect(
      `${tag} long press release does not select`,
      (await selectedPart()) === selectedBefore,
      `${selectedBefore} -> ${await selectedPart()}`
    );
    await closePartWindows('designPartWindows');
    await shortTap(designHit.x, designHit.y);
    const opened = await partWindows('designPartWindows');
    expect(`${tag} workshop short tap opens no window`, opened === 0, opened);
    expect(`${tag} workshop short tap still selects`, await selectedPart(), await selectedPart());
    await closePartWindows('designPartWindows');
  }
  // Placement (8f): the first tap previews the ghost (no part added), a second tap on it places the part;
  // the touch cancel button ends placing. Taps go to the canvas through CDP.
  const partCount = () => page.evaluate(() => Number(document.getElementById('count')?.textContent));
  const placement = () =>
    page.evaluate(() => {
      const e = document.getElementById('placement');
      return {
        shown: !!e && !e.hidden && e.getBoundingClientRect().width > 0,
        preview: e?.dataset.touchPreview ?? null,
        text: e?.firstChild?.textContent ?? ''
      };
    });
  const canvasPoints = step =>
    page.evaluate(step => {
      const c = document.getElementById('scene').getBoundingClientRect(),
        cx = c.left + c.width / 2,
        cy = c.top + c.height / 2,
        out = [];
      for (let x = c.left + step / 2; x < c.right; x += step)
        for (let y = c.top + step / 2; y < c.bottom; y += step)
          if (document.elementFromPoint(x, y)?.id === 'scene') out.push([x, y]);
      return out.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
    }, step);
  const countBefore = await partCount();
  // In portrait the open vessel panel covers the part library: close it first, as a player would.
  const cardCovered = await page.evaluate(() => {
    const c = document.querySelector('#parts .partcard'),
      b = c?.getBoundingClientRect(),
      top = b && document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !top || !c.contains(top);
  });
  if (cardCovered) {
    await page.tap('#panelDock button[aria-controls=inspector]');
    await page.waitForTimeout(300);
  }
  await page.tap('#parts .partcard');
  await page.waitForTimeout(500);
  const started = await placement();
  expect(
    `${tag} part card tap starts placing (tap hint, no keys)`,
    started.shown && /タップ|Tap/.test(started.text) && !/Esc|クリック|Click/.test(started.text),
    JSON.stringify(started)
  );
  // Points 40 px apart (beyond the commit radius), centre first, until a tap previews on an attach node.
  let previewAt = null,
    previewTries = 0;
  for (const [x, y] of (await canvasPoints(40)).slice(0, 30)) {
    previewTries++;
    await touch('touchStart', x, y);
    await page.waitForTimeout(60);
    await touch('touchEnd', x, y);
    await page.waitForTimeout(250);
    if ((await placement()).preview === 'node') {
      previewAt = [x, y];
      break;
    }
  }
  const previewed = await placement(),
    countPreview = await partCount();
  expect(
    `${tag} first tap previews on an attach node`,
    !!previewAt && /もう一度タップ|Tap again/.test(previewed.text),
    JSON.stringify({previewAt, previewTries, ...previewed})
  );
  expect(`${tag} first tap adds no part`, countPreview === countBefore, `${countBefore} -> ${countPreview}`);
  await shot('workshop-place-preview');
  await checkLayout(
    'workshop placing',
    ['#placement', '#toolbar', '.viewactions', '#panelDock button'],
    ['#placement']
  );
  if (previewAt) {
    await touch('touchStart', previewAt[0], previewAt[1]);
    await page.waitForTimeout(60);
    await touch('touchEnd', previewAt[0], previewAt[1]);
    await page.waitForTimeout(800);
    const placed = await placement(),
      countPlaced = await partCount();
    expect(
      `${tag} second tap on the preview places the part`,
      countPlaced > countBefore && placed.preview === null,
      `${countBefore} -> ${countPlaced} ${JSON.stringify(placed)}`
    );
    await shot('workshop-place-placed');
  }
  await page.tap('#placementCancel');
  await page.waitForTimeout(300);
  expect(
    `${tag} touch cancel button ends placing`,
    !(await placement()).shown,
    JSON.stringify(await placement())
  );
  while ((await partCount()) > countBefore && (await page.isEnabled('#undo'))) {
    await page.evaluate(() => document.getElementById('undo').click());
    await page.waitForTimeout(400);
  }
  expect(`${tag} undo restores the part count`, (await partCount()) === countBefore, await partCount());
  // Gizmo (8f): select a part, switch to translate, drag the gizmo centre with one finger: the part moves and
  // the camera does not rotate. The camera and gizmo are read from the page's own scene module (test only).
  const sceneModule = new URL('scene.js', page.url()).href;
  const view = () =>
    page.evaluate(async u => {
      const {sceneCore, editorMarkers} = await import(u),
        {camera, canvas} = sceneCore(),
        {gizmo} = editorMarkers(),
        r = canvas.getBoundingClientRect();
      camera.updateMatrixWorld();
      const o = gizmo.object,
        p = o ? o.getWorldPosition(o.position.clone()).project(camera) : null;
      return {
        camera: camera.matrixWorld.elements.map(v => +v.toFixed(4)),
        size: gizmo.size,
        attached: !!o,
        axis: gizmo.axis,
        dragging: gizmo.dragging,
        screen: p && [r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height]
      };
    }, sceneModule);
  const partPos = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#selection input[data-field=p]')].map(i => i.value).join(',')
    );
  const cameraMoved = (a, b) => a.camera.some((v, i) => Math.abs(v - b.camera[i]) > 1e-3);
  if (designHit) {
    await shortTap(designHit.x, designHit.y);
    await page.tap('#toolbar button[data-mode=translate]');
    await page.waitForTimeout(500);
    const g0 = await view(),
      pos0 = await partPos();
    expect(`${tag} gizmo attached and enlarged`, g0.attached && g0.size > 1.2, `${g0.attached} ${g0.size}`);
    if (g0.attached && g0.screen) {
      const [gx, gy] = g0.screen;
      await touch('touchStart', gx, gy);
      await page.waitForTimeout(50);
      const grabbed = await view();
      for (let i = 1; i <= 8; i++) await touch('touchMove', gx + i * 6, gy - i * 4);
      await page.waitForTimeout(100);
      const during = await view();
      await touch('touchEnd', gx + 48, gy - 32);
      await page.waitForTimeout(600);
      const g1 = await view(),
        pos1 = await partPos();
      expect(
        `${tag} finger on the gizmo grabs a handle`,
        grabbed.dragging,
        `${grabbed.axis} ${grabbed.dragging}`
      );
      expect(`${tag} gizmo drag moves the part`, pos1 !== pos0 && pos1 !== '', `${pos0} -> ${pos1}`);
      expect(
        `${tag} gizmo drag does not rotate the camera`,
        !cameraMoved(g0, during) && !cameraMoved(g0, g1),
        cameraMoved(g0, g1)
      );
      await shot('workshop-gizmo');
      // Control: the same finger drag away from the gizmo rotates the camera (the observable works).
      const free = (await canvasPoints(20)).find(([x, y]) => Math.hypot(x - gx, y - gy) > 150);
      if (free) {
        await touch('touchStart', free[0], free[1]);
        for (let i = 1; i <= 8; i++) await touch('touchMove', free[0] + i * 6, free[1]);
        await touch('touchEnd', free[0] + 48, free[1]);
        await page.waitForTimeout(600);
        expect(`${tag} control: a free drag rotates the camera`, cameraMoved(g1, await view()), true);
      }
      await page.evaluate(() => document.getElementById('undo').click());
      await page.waitForTimeout(400);
    }
    await page.tap('#toolbar button[data-mode=select]');
    await page.waitForTimeout(300);
  }
  await page.tap('#launch');
  await page.waitForTimeout(6000);
  await shot('flight');
  // On the pad (before staging) the vessel stands still.
  const flightHit = await longPressPart('partWindows');
  expect(`${tag} flight long press opens a part window`, !!flightHit, JSON.stringify(flightHit));
  if (flightHit) {
    await shot('flight-partwindow');
    await closePartWindows('partWindows');
    await shortTap(flightHit.x, flightHit.y);
    const opened = await partWindows('partWindows');
    expect(`${tag} flight short tap opens no window`, opened === 0, opened);
  }
  const flightKeys = [
    '#universalTime',
    '.hudreadings.altimeter',
    '#flightQuickNav',
    '.navpanel',
    '#flightMenu',
    '#flightSystems',
    '#stageDock',
    '#openDocking',
    '#audioButton',
    '#panelDock button[aria-controls=inspector]',
    '.headright',
    '#touchStick',
    '#touchFlight .touchRoll',
    '#touchFlight .touchMain'
  ];
  const flightPanels = [
    '.navpanel',
    '#stageDock',
    '#touchFlight',
    '#flightQuickNav',
    '#panelDock',
    '.headright',
    '#flightMenu',
    '#flightSystems'
  ];
  // A part selected in the workshop opens the vessel panel, which stays open in flight: it must not cover
  // the flight controls either. Then close it for the rest of the run.
  const inspectorToggle = '#panelDock button[aria-controls=inspector]';
  if ((await page.getAttribute(inspectorToggle, 'aria-expanded')) !== 'true') await page.tap(inspectorToggle);
  await page.waitForTimeout(300);
  await checkLayout(
    'flight vessel panel',
    [
      '#inspector',
      '.navpanel',
      '#touchStick',
      '#touchFlight .touchRoll',
      '#touchFlight .touchMain',
      '#flightSystems',
      inspectorToggle,
      '.headright',
      '#stageDock'
    ],
    []
  );
  await shot('flight-inspector');
  await page.tap(inspectorToggle);
  await page.waitForTimeout(300);
  await checkLayout('flight', flightKeys, flightPanels);
  // The SAS directions open above the compact console and close after a choice.
  await page.tap('#touchSasToggle');
  await page.waitForTimeout(300);
  await checkLayout(
    'flight SAS directions',
    ['#sasDirections', '.navpanel canvas', '#touchStick'],
    ['#sasDirections']
  );
  await shot('flight-sas');
  await page.tap('#sasDirections button[data-mode=hold]');
  await page.waitForTimeout(300);
  const sasClosed = await page.evaluate(
    () => getComputedStyle(document.getElementById('sasDirections')).display
  );
  expect(`${tag} SAS directions close after a choice`, sasClosed === 'none', sasClosed);
  // Flight controls (8b): stage, full throttle and the stick feed the keyboard's held-key path.
  const controls = await page.evaluate(() => {
    const visible = e => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
    const stage = document.getElementById('stage'),
      box = stage?.getBoundingClientRect(),
      top = box && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      pad: visible(document.getElementById('touchFlight')),
      stick: visible(document.getElementById('touchStick')),
      stageReachable: !!top && !!stage?.contains(top)
    };
  });
  expect(`${tag} touch flight controls shown`, controls.pad && controls.stick, JSON.stringify(controls));
  expect(`${tag} #stage still reachable`, controls.stageReachable, controls.stageReachable);
  await page.tap('#touchFlight button[data-code=Space]');
  await page.waitForTimeout(1500);
  const toast = await page.evaluate(() => document.getElementById('toast')?.textContent ?? '');
  expect(`${tag} stage by touch button`, /ステージ|Stage/.test(toast), toast);
  expect(`${tag} ignition hint without keys`, /「全推力」/.test(toast) && !/Zで/.test(toast), toast);
  const readout = () =>
    page.evaluate(() => ({
      alt: Number(document.getElementById('alt')?.textContent?.replace(/[^0-9.-]/g, '')),
      unit: document.getElementById('alt')?.nextElementSibling?.textContent ?? '',
      attitude: document.getElementById('navPitch')?.textContent ?? '',
      held: document.getElementById('touchFlight')?.dataset.held ?? '',
      throttle: document.getElementById('throttleVal')?.textContent ?? ''
    }));
  const before = await readout();
  await page.tap('#touchFlight button[data-code=KeyZ]');
  await page.waitForTimeout(4000);
  const climbing = await readout();
  expect(`${tag} full throttle by tap`, climbing.throttle === '100%', climbing.throttle);
  const meters = r => r.alt * (r.unit.trim() === 'km' ? 1000 : 1);
  expect(
    `${tag} altitude increases`,
    meters(climbing) > meters(before) + 5,
    `${before.alt} -> ${climbing.alt}`
  );
  // Drag the stick up (W, pitch) with a real touch through CDP and hold it.
  const stick = await page.locator('#touchStick').boundingBox();
  const cx = stick.x + stick.width / 2,
    cy = stick.y + stick.height / 2;
  await touch('touchStart', cx, cy);
  for (let i = 1; i <= 5; i++) await touch('touchMove', cx + i, cy - i * 10);
  await page.waitForTimeout(400);
  const holding = await readout();
  await page.waitForTimeout(2000);
  const turned = await readout();
  await shot('flight-stick');
  await touch('touchEnd', cx, cy - 50);
  await page.waitForTimeout(300);
  const released = await readout();
  expect(`${tag} stick holds W`, holding.held === 'KeyW', holding.held);
  expect(
    `${tag} attitude changes with the stick`,
    turned.attitude !== climbing.attitude,
    `${climbing.attitude} -> ${turned.attitude}`
  );
  expect(`${tag} stick released`, released.held === '', JSON.stringify(released.held));
  // Orbit map (8d): open by tap, pinch out zooms in (the #mapScale readout shrinks), a double tap on the
  // body re-centres (focus switches, extent resets), close by tap.
  await page.tap('#openOrbitMap');
  await page.waitForTimeout(1500);
  const mapState = () =>
    page.evaluate(() => {
      const overlay = document.getElementById('orbitOverlay');
      return {
        visible: !!overlay && !overlay.hidden && overlay.getBoundingClientRect().width > 0,
        km: Number(document.getElementById('mapScale')?.textContent?.replace(/[^0-9.]/g, '')),
        focus: document.querySelector('.mapToolbar button[aria-pressed=true]')?.dataset.focus ?? ''
      };
    });
  const mapOpen = await mapState();
  await checkLayout(
    'orbit map',
    [
      '.mapToolbar',
      '#closeOrbitMap',
      '#mapPlanPanel',
      '#mapOrbitPanel',
      '.trajectoryPanel',
      '.mapTargets',
      '#mapThrottle'
    ],
    ['.mapToolbar', '#orbitOverlay .mapHeader', '#mapThrottle']
  );
  expect(`${tag} orbit map opens by tap`, mapOpen.visible && mapOpen.km > 0, JSON.stringify(mapOpen));
  // Free canvas points (not under the toolbar or panels), nearest the canvas centre first.
  const mapPoints = await page.evaluate(() => {
    const c = document.getElementById('largeOrbitMap').getBoundingClientRect(),
      cx = c.left + c.width / 2,
      cy = c.top + c.height / 2,
      out = [];
    for (let x = c.left + 10; x < c.right; x += 10)
      for (let y = c.top + 10; y < c.bottom; y += 10)
        if (document.elementFromPoint(x, y)?.id === 'largeOrbitMap') out.push([x, y]);
    return out.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
  });
  // A horizontal pair of free points 40 px apart moving to 160 px apart.
  const pair = mapPoints.find(([x, y]) =>
    [-80, -20, 20, 80].every(d => mapPoints.some(p => p[0] === x + d && p[1] === y))
  );
  expect(`${tag} free map area for a pinch`, !!pair, JSON.stringify(pair));
  if (pair) {
    const [px, py] = pair,
      fingers = d => [
        {x: px - d, y: py, id: 11},
        {x: px + d, y: py, id: 12}
      ];
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: fingers(20)});
    for (let d = 30; d <= 80; d += 10)
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: fingers(d)});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await page.waitForTimeout(500);
    const pinched = await mapState();
    expect(
      `${tag} pinch out zooms in`,
      pinched.km < mapOpen.km * 0.5 && pinched.km > 0,
      `${mapOpen.km} km -> ${pinched.km} km`
    );
    await shot('orbitmap-pinch');
    // Zoomed in, the current body fills the middle of the map: double tap there re-centres on it.
    await page.waitForTimeout(400);
    for (let i = 0; i < 2; i++) {
      await touch('touchStart', px, py);
      await page.waitForTimeout(50);
      await touch('touchEnd', px, py);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(500);
    const centred = await mapState();
    expect(
      `${tag} double tap re-centres`,
      centred.focus !== pinched.focus && centred.km !== pinched.km,
      `${pinched.focus} ${pinched.km} km -> ${centred.focus} ${centred.km} km`
    );
    await shot('orbitmap-doubletap');
  }
  await page.tap('#closeOrbitMap');
  await page.waitForTimeout(800);
  const mapClosed = await mapState();
  expect(`${tag} orbit map closes by tap`, !mapClosed.visible, JSON.stringify(mapClosed));
  l = await layout();
  expect(`${tag} flight no overflow`, !l.overflow, l.overflow);
  expect(`${tag} console errors`, errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 0);
  await context.close();
}
await browser.close();
process.exitCode = failed;

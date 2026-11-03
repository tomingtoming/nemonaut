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
  await page.tap('#enterVAB');
  await page.waitForTimeout(3000);
  l = await layout();
  expect(`${tag} workshop no overflow`, !l.overflow, l.overflow);
  await shot('workshop');
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

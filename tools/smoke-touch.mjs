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
  await page.tap('#launch');
  await page.waitForTimeout(6000);
  await shot('flight');
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
  const cdp = await context.newCDPSession(page);
  const cx = stick.x + stick.width / 2,
    cy = stick.y + stick.height / 2;
  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{x, y, id: 1}]});
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
  l = await layout();
  expect(`${tag} flight no overflow`, !l.overflow, l.overflow);
  expect(`${tag} console errors`, errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 0);
  await context.close();
}
await browser.close();
process.exitCode = failed;

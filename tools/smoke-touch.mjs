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
  await page.tap('#stage');
  await page.waitForTimeout(1500);
  const toast = await page.evaluate(() => document.getElementById('toast')?.textContent ?? '');
  expect(`${tag} stage by tap`, /ステージ|Stage/.test(toast), toast);
  l = await layout();
  expect(`${tag} flight no overflow`, !l.overflow, l.overflow);
  expect(`${tag} console errors`, errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 0);
  await context.close();
}
await browser.close();
process.exitCode = failed;

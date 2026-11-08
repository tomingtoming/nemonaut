// With tools/serve.mjs running, open its localhost URL in playwright-cli (Chrome),
// then run-code --filename=tools/browser-physics-profile.pw.js in that session.
async page => {
  const origin = new URL(page.url()).origin;
  if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Expected local build');
  const importMap = await page.locator('script[type=importmap]').textContent();
  const browser = page.context().browser();
  const rows = [];
  for (const rate of [1, 4, 4, 1, 1, 4]) {
    const context = await browser.newContext({
      viewport: {width: 844, height: 390},
      hasTouch: true,
      isMobile: true
    });
    try {
      const tab = await context.newPage();
      const cdp = await context.newCDPSession(tab);
      await cdp.send('Emulation.setCPUThrottlingRate', {rate});
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', {cacheDisabled: true});
      await cdp.send('Performance.enable', {timeDomain: 'threadTicks'});
      const taskTime = async () => {
        const {metrics} = await cdp.send('Performance.getMetrics');
        return metrics.find(m => m.name === 'TaskDuration').value * 1000;
      };
      const url = origin + '/physics-profile';
      await tab.route(url, route =>
        route.fulfill({contentType: 'text/html', body: '<script type="importmap">' + importMap + '</script>'})
      );
      await tab.goto(url);
      const startup = await tab.evaluate(async () => {
        const {loadPhysics} = await import('/physics.js');
        const compile = WebAssembly.compile;
        let readMs, compileMs, bytes;
        const start = performance.now();
        WebAssembly.compile = async function (buffer) {
          const begin = performance.now();
          readMs = begin - start;
          bytes = buffer.byteLength;
          const module = await compile.call(WebAssembly, buffer);
          compileMs = performance.now() - begin;
          return module;
        };
        try {
          await loadPhysics();
        } finally {
          WebAssembly.compile = compile;
        }
        if (!(bytes > 0)) throw Error('Expected first compile in a fresh realm');
        return {readMs, compileMs, bytes};
      });
      for (const design of ['plane', 'transport-cargo']) {
        const setup = await tab.evaluate(async design => {
          const {Flight} = await import('/core.js');
          const {preset} = await import('/catalog.js');
          const parts = preset(design);
          const start = performance.now();
          const f = new Flight(parts, 'runway', 161700);
          const initMs = performance.now() - start;
          const memory = f.world.exports.memory;
          const initialBytes = memory.buffer.byteLength;
          f.stageNext();
          f.throttle = 0.35;
          for (let i = 0; i < 30; i++) f.step(1 / 120);
          window.profileFlight = f;
          return {initMs, initialBytes, parts: parts.length};
        }, design);
        const before = await taskTime();
        const tick = await tab.evaluate(() => {
          const f = window.profileFlight;
          const start = performance.now();
          for (let i = 0; i < 120; i++) f.step(1 / 120);
          const tickMs = performance.now() - start;
          if (f.crashed || f.detached.length || Math.abs(f.universalTime - 161701.25) > 1e-6)
            throw Error('Flight diverged');
          return {tickMs, endBytes: f.world.exports.memory.buffer.byteLength};
        });
        const threadTaskMs = (await taskTime()) - before;
        await tab.evaluate(() => {
          window.profileFlight.dispose();
          delete window.profileFlight;
        });
        rows.push({rate, design, ...startup, ...setup, ...tick, threadTaskMs});
      }
    } finally {
      await context.close();
    }
  }
  return {browser: browser.version(), rows};
}

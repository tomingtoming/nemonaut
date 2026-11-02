import {Flight, statistics} from '../dist/core.js';
import {preset} from '../dist/catalog.js';
import {TakeoffPrototype} from './takeoff-prototype.mjs';
import {TakeoffPreviewClient} from './takeoff-preview-client.mjs';
const result = document.querySelector('#result'),
  history = document.querySelector('#history');
const client = new TakeoffPreviewClient(() => new Worker('/takeoff-forecast-worker.js', {type: 'module'}));
let ticks = 0,
  run = 0;
setInterval(() => {
  document.querySelector('#ticks').textContent = String(++ticks);
}, 50);
document.querySelector('#cancel').onclick = () => client.cancel();
for (const fuel of [1, 0.5])
  document.querySelector(fuel === 1 ? '#full' : '#half').onclick = async () => {
    const id = ++run,
      begin = ticks,
      f = new Flight(preset('transport-cargo'), 'runway', 161700);
    f.stageNext();
    for (const [key, v] of f.fuel) f.fuel.set(key, v * fuel);
    f.stats = statistics(f.parts, f.fuel, f.ballast, f.thermal);
    const pilot = new TakeoffPrototype(f, {speed: 90, rotation: 12, integral: true, handoff: 'attitude'});
    result.textContent = '計算中';
    try {
      const r = await client.request(f, pilot, {seconds: 40});
      const report = {run: id, fuel, ...r, uiTicksDuring: ticks - begin, liveTime: f.time};
      history.textContent += JSON.stringify(report) + '\n';
      if (run === id) result.textContent = JSON.stringify(report, null, 2);
    } catch (error) {
      result.textContent = error.message;
    } finally {
      f.dispose();
    }
  };
result.textContent = '準備完了';

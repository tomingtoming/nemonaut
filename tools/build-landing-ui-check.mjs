import {build} from 'esbuild';
import {mkdir, writeFile} from 'node:fs/promises';
await mkdir('dist/_diagnostics', {recursive: true});
await build({
  entryPoints: ['tools/landing-ui-check.mjs'],
  outfile: 'dist/_diagnostics/landing-ui-check.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  plugins: [
    {
      name: 'live-panel',
      setup(b) {
        b.onResolve({filter: /^\.\.\/dist\/cruise-panel\.js$/}, () => ({
          path: '../cruise-panel.js',
          external: true
        }));
        b.onResolve({filter: /^three$/}, () => ({path: 'three', external: true}));
      }
    }
  ]
});
await writeFile(
  'dist/_diagnostics/landing-ui-check.html',
  `<!doctype html><meta charset="utf-8"><title>着陸UI・Worker検証</title>
<script type="importmap">{"imports":{"three":"../vendor/three/three.module.js"}}</script>
<style>body{background:#18232b;color:#eee;font:16px system-ui;margin:24px}button,input,select{font:inherit;margin:3px} .floatingWindow{position:fixed;background:#26343f;border:1px solid #87939b;padding:14px;width:290px}.floatingWindow header{display:flex;justify-content:space-between}pre{line-height:1.6}</style>
<h1>着陸UI・Worker検証</h1><p>空中fixture · 貨物機・半燃料・09手前6km。通常出発の証拠にはしない。</p>
<button id="run">飛行を進める</button><button id="reset">fixtureを再作成</button><button id="sas">SAS</button>
<label>検証速度<select id="rate"><option value="1">1倍</option><option value="4">4倍</option></select></label><div id="flightSystems"></div><pre id="result">初期化中</pre><script type="module" src="./landing-ui-check.js"></script>`
);

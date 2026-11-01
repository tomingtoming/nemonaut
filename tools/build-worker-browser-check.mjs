import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('dist/_diagnostics',{recursive:true});
await build({entryPoints:['tools/worker-browser-check.mjs'],outfile:'dist/_diagnostics/worker-check.js',bundle:true,format:'esm',platform:'browser',target:'es2022',plugins:[{name:'vendors',setup(b){
 b.onResolve({filter:/^three$/},()=>({path:'../vendor/three/three.module.js',external:true}));
}}]});
await writeFile('dist/_diagnostics/worker-check.html','<!doctype html><meta charset="utf-8"><title>離陸予測 Worker 検証</title><h1>離陸予測 Worker 検証</h1><p>UI更新 <span id="ticks">0</span></p><button id="full">満載</button> <button id="half">半燃料</button> <button id="cancel">取消</button><pre id="result">読込中</pre><h2>実行履歴</h2><pre id="history"></pre><script type="module" src="./worker-check.js"></script>');

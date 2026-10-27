import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const check=process.argv.includes('--check');
const result=await build({write:!check,entryPoints:['tools/takeoff-preview-worker.mjs'],outfile:'dist/takeoff-forecast-worker.js',bundle:true,format:'esm',platform:'browser',target:'es2022',legalComments:'inline',plugins:[{
 name:'existing-vendors',setup(build){
  build.onResolve({filter:/^three$/},()=>({path:'./vendor/three/three.module.js',external:true}));
  build.onResolve({filter:/vendor\/rapier\/rapier\.mjs$/},()=>({path:'./vendor/rapier/rapier.mjs',external:true}));
 }
}]});
if(check&&(await readFile('dist/takeoff-forecast-worker.js','utf8'))!==result.outputFiles[0].text)throw Error('Rebuild the takeoff worker before publishing');

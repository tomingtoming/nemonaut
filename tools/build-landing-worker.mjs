import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const check=process.argv.includes('--check');
const result=await build({write:!check,entryPoints:['tools/landing-plan-worker.mjs'],outfile:'dist/landing-plan-worker.js',bundle:true,format:'esm',platform:'browser',target:'es2022',legalComments:'inline',plugins:[{
 name:'existing-vendors',setup(build){
  build.onResolve({filter:/^three$/},()=>({path:'./vendor/three/three.module.js',external:true}));
  build.onResolve({filter:/vendor\/rapier\/rapier\.mjs$/},()=>({path:'./vendor/rapier/rapier.mjs',external:true}));
 }
}]});
if(check&&(await readFile('dist/landing-plan-worker.js','utf8')).replace(/\r\n/g,'\n')!==result.outputFiles[0].text.replace(/\r\n/g,'\n'))throw Error('Rebuild the landing worker before publishing');

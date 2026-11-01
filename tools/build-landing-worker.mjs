// Generated into dist by tools/build.mjs (run from the repository root).
import {build} from 'esbuild';
await build({entryPoints:['tools/landing-plan-worker.mjs'],outfile:'dist/landing-plan-worker.js',bundle:true,format:'esm',platform:'browser',target:'es2022',legalComments:'inline',plugins:[{
 name:'existing-vendors',setup(build){
  build.onResolve({filter:/^three$/},()=>({path:'./vendor/three/three.module.js',external:true}));
 }
}]});

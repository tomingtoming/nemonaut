import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const check=process.argv.includes('--check');
const result=await build({entryPoints:['tools/maneuver-entry.mjs'],outfile:'dist/maneuver-controller.js',write:!check,bundle:true,format:'esm',platform:'browser',target:'es2022',plugins:[{name:'share-live-modules',setup(b){
 b.onResolve({filter:/^three$/},()=>({path:'three',external:true}));
 b.onResolve({filter:/^\.\.\/dist\//},args=>({path:'./'+args.path.slice('../dist/'.length),external:true}));
}}]});
if(check&&(await readFile('dist/maneuver-controller.js','utf8')).replace(/\r\n/g,'\n')!==result.outputFiles[0].text.replace(/\r\n/g,'\n'))throw Error('Rebuild the maneuver controller');

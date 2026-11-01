// Checks that moving a module from .js to .ts changed types only: the esbuild output of each src/*.ts
// must equal the output of its last committed .js version (comments dropped, same printer).
// Usage: node tools/ts-equivalence.mjs [git revision holding the .js files, default HEAD] [names...]
import {transform} from 'esbuild';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const revision=process.argv[2]??'HEAD',only=new Set(process.argv.slice(3));
const options=loader=>({loader,format:'esm',target:'es2022',charset:'utf8',tsconfigRaw:{compilerOptions:{verbatimModuleSyntax:true}}});
let same=0,different=[],missing=0;
for(const file of (await readdir('src')).filter(f=>f.endsWith('.ts')&&!f.endsWith('.d.ts'))){
 const name=file.slice(0,-3);if(only.size&&!only.has(name))continue;
 let js;try{js=execFileSync('git',['show',`${revision}:src/${name}.js`],{encoding:'utf8',maxBuffer:64<<20,stdio:['ignore','pipe','ignore']});}catch{missing++;continue;}
 const [a,b]=await Promise.all([transform(js,options('js')),transform(await readFile('src/'+file,'utf8'),options('ts'))]);
 if(a.code===b.code)same++;else different.push(name);
}
console.log(JSON.stringify({revision,same,different,noJsAtRevision:missing}));
if(different.length)process.exitCode=1;

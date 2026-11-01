// Checks that a change was type-only: the esbuild output of each src/*.ts must equal the output of
// the same module at a git revision (.js before the 4d migration, .ts after; comments dropped).
// Usage: node tools/ts-equivalence.mjs [git revision, default HEAD] [names...]
import {transform} from 'esbuild';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const revision=process.argv[2]??'HEAD',only=new Set(process.argv.slice(3));
const options=loader=>({loader,format:'esm',target:'es2022',charset:'utf8',tsconfigRaw:{compilerOptions:{verbatimModuleSyntax:true}}});
let same=0,different=[],missing=0;
for(const file of (await readdir('src')).filter(f=>f.endsWith('.ts')&&!f.endsWith('.d.ts'))){
 const name=file.slice(0,-3);if(only.size&&!only.has(name))continue;
 const show=ext=>{try{return execFileSync('git',['show',`${revision}:src/${name}${ext}`],{encoding:'utf8',maxBuffer:64<<20,stdio:['ignore','pipe','ignore']});}catch{return null;}};
 // The revision may still hold the .js (before 4d) or already the .ts (type hardening).
 const js=show('.js'),old=js??show('.ts');if(old===null){missing++;continue;}
 const [a,b]=await Promise.all([transform(old,options(js===null?'ts':'js')),transform(await readFile('src/'+file,'utf8'),options('ts'))]);
 if(a.code===b.code)same++;else different.push(name);
}
console.log(JSON.stringify({revision,same,different,noJsAtRevision:missing}));
if(different.length)process.exitCode=1;

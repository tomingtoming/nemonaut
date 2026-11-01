// Builds the delivered site: src/ → dist/ (dist is output only, never edited or committed).
// JS and static files are copied byte for byte; .ts files are transformed one by one (no bundling,
// import paths stay as written, e.g. './celestial.js'; every import is kept, as
// verbatimModuleSyntax asks, so an import kept only for its side effects still runs). Then the five bundles are generated.
// Usage: node tools/build.mjs [--quiet]
import {transform} from 'esbuild';
import {readdir,readFile,writeFile,mkdir,rm,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SRC=path.join(root,'src'),OUT=path.join(root,'dist');
const BUNDLES=['build-takeoff-worker.mjs','build-takeoff-controller.mjs','build-maneuver.mjs','build-orbital-ascent.mjs','build-landing-worker.mjs'];
const isDeclaration=f=>/\.d\.m?ts$/.test(f);

async function* walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())yield* walk(p);else yield p;}}

export async function buildSite({quiet=false}={}){
 const started=performance.now();
 await rm(OUT,{recursive:true,force:true});
 let copied=0,transformed=0;
 for await(const file of walk(SRC)){
  const rel=path.relative(SRC,file);if(isDeclaration(rel))continue;
  if(rel.endsWith('.ts')){
   const target=path.join(OUT,rel.slice(0,-3)+'.js');await mkdir(path.dirname(target),{recursive:true});
   const {code}=await transform(await readFile(file,'utf8'),{loader:'ts',format:'esm',target:'es2022',charset:'utf8',sourcefile:rel,tsconfigRaw:{compilerOptions:{verbatimModuleSyntax:true}}});
   await writeFile(target,code);transformed++;
  }else{const target=path.join(OUT,rel);await mkdir(path.dirname(target),{recursive:true});await copyFile(file,target);copied++;}
 }
 // The bundle scripts resolve their paths (tools/…, dist/…) from the repository root.
 const cwd=process.cwd();process.chdir(root);
 try{for(const script of BUNDLES)await import(pathToFileURL(path.join(root,'tools',script)).href+'?'+Date.now());}
 finally{process.chdir(cwd);}
 if(!quiet)console.log(`built dist: ${copied} copied, ${transformed} transformed, ${BUNDLES.length} bundles, ${Math.round(performance.now()-started)} ms`);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))await buildSite({quiet:process.argv.includes('--quiet')});

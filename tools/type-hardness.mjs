// Type hardening gauge (BACKLOG 5). For every src/*.ts: errors under `strict`, explicit `any`
// types, and @ts-ignore / @ts-expect-error / @ts-nocheck comments. Files listed in
// tools/hardened.json must stay at zero on all three (a ratchet: CI fails on a step back).
// Usage: node tools/type-hardness.mjs [--check] [--candidates] [--json]
//   --check       exit 1 if a listed file is not hard (or a listed name does not exist)
//   --candidates  unlisted files whose src imports are all listed (the next wave), with counts
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const listFile=path.join(root,'tools','hardened.json');

export function measure(){
 const config=ts.getParsedCommandLineOfConfigFile(path.join(root,'tsconfig.json'),{strict:true,noEmit:true},{...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});
 const program=ts.createProgram({rootNames:config.fileNames,options:config.options});
 const files=new Map();
 for(const sf of program.getSourceFiles()){
  const rel=path.relative(root,sf.fileName).replaceAll('\\','/');
  if(!/^src\/[^/]+\.ts$/.test(rel)||rel.endsWith('.d.ts'))continue;
  const name=rel.slice(4,-3);
  let any=0;const visit=n=>{if(n.kind===ts.SyntaxKind.AnyKeyword)any++;ts.forEachChild(n,visit);};visit(sf);
  const ignores=(sf.text.match(/@ts-(?:ignore|expect-error|nocheck)\b/g)||[]).length;
  const imports=[];
  for(const st of sf.statements)if((ts.isImportDeclaration(st)||ts.isExportDeclaration(st))&&st.moduleSpecifier&&ts.isStringLiteral(st.moduleSpecifier)){
   const m=st.moduleSpecifier.text.match(/^\.\/([^/]+)\.js$/);if(m)imports.push(m[1]);
  }
  const errors=program.getSemanticDiagnostics(sf).length+program.getSyntacticDiagnostics(sf).length;
  files.set(name,{errors,any,ignores,imports});
 }
 return files;
}
export const isHard=f=>f.errors===0&&f.any===0&&f.ignores===0;

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const files=measure(),listed=new Set(JSON.parse(readFileSync(listFile,'utf8')).files);
 const total={files:files.size,hardened:0,errors:0,any:0,ignores:0};
 for(const [name,f] of files){total.errors+=f.errors;total.any+=f.any;total.ignores+=f.ignores;if(listed.has(name)&&isHard(f))total.hardened++;}
 const broken=[...listed].filter(n=>!files.has(n)||!isHard(files.get(n))).map(n=>({name:n,...(files.get(n)??{missing:true})}));
 console.log(JSON.stringify({...total,listed:listed.size,broken}));
 if(process.argv.includes('--candidates')){
  // A module whose src imports (including type-only ones) are all listed; files in an import
  // cycle with each other are offered together once everything else they import is listed.
  const open=[...files].filter(([n])=>!listed.has(n));
  const ready=open.filter(([,f])=>f.imports.every(i=>listed.has(i)||!files.has(i)));
  for(const [name,f] of ready.sort((a,b)=>a[1].errors+a[1].any-(b[1].errors+b[1].any)))console.log(`${name}\terrors ${f.errors}\tany ${f.any}\tignores ${f.ignores}`);
  if(!ready.length&&open.length)console.log('no file has all imports listed: an import cycle remains among '+open.map(([n])=>n).join(' '));
 }
 if(process.argv.includes('--check')&&broken.length)process.exitCode=1;
}

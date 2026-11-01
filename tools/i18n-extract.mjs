// Lists every Japanese UI string in dist (string and template pieces of the built JS, parsed with
// the TypeScript compiler, and index.html text/attributes) and compares it with dist/i18n/en.json.
// Usage: node tools/i18n-extract.mjs [--missing out.json]   (run after npm run build)
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const JA=/[぀-ヿ㐀-鿿！-｠]/;
export async function extract(root=new URL('../dist/',import.meta.url)){
 const found=new Map();
 // Markup reaches the screen as separate text nodes and attributes, so split it into those pieces.
 const add=(s,where)=>{
  if(!JA.test(s))return;
  // A template piece may end inside a tag (`<input aria-label="位置 ${...}">`): take the open
  // attribute value and the text before the tag.
  if(/<[a-zA-Z/]/.test(s)){
   for(const m of s.matchAll(/\s(?:title|aria-label|placeholder)="([^"]*)(?:"|$)/g))add(m[1],where);
   for(const piece of s.replace(/<[^>]*(?:>|$)/g,'\u0000').split('\u0000'))add(piece,where);
   return;
  }
  if(!found.has(s))found.set(s,new Set());found.get(s).add(where);
 };
 // Every string literal and template piece (head, middle, tail) of each shipped module. Comments are
 // not strings, and templates nested inside ${...} are visited as nodes of their own.
 for(const f of (await readdir(root)).filter(f=>f.endsWith('.js'))){
  const source=ts.createSourceFile(f,await readFile(new URL(f,root),'utf8'),ts.ScriptTarget.Latest,false,ts.ScriptKind.JS);
  const visit=node=>{
   if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node))add(node.text,f);
   ts.forEachChild(node,visit);
  };
  visit(source);
 }
 const html=await readFile(new URL('index.html',root),'utf8');
 for(const m of html.matchAll(/>([^<]+)</g))add(m[1],'index.html');
 for(const m of html.matchAll(/\s(?:title|aria-label|placeholder)="([^"]*)"/g))add(m[1],'index.html');
 return found;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const found=await extract(),en=JSON.parse(await readFile(new URL('../dist/i18n/en.json',import.meta.url),'utf8').catch(()=>'{}'));
 const missing=[...found.keys()].filter(k=>!(k in en)),stale=Object.keys(en).filter(k=>!found.has(k));
 console.log(JSON.stringify({strings:found.size,translated:found.size-missing.length,coverage:+((found.size-missing.length)/found.size*100).toFixed(1),missing:missing.length,stale:stale.length}));
 const i=process.argv.indexOf('--missing');
 if(i>0)await writeFile(process.argv[i+1],JSON.stringify({missing:Object.fromEntries(missing.map(k=>[k,[...found.get(k)].join(',')])),stale},null,1));
}

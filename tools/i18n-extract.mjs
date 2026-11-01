// Lists every Japanese UI string in dist (JS string literals, including \u escapes in bundles,
// and index.html text/attributes) and compares it with dist/i18n/en.json.
// Usage: node tools/i18n-extract.mjs [--missing out.json]
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const JA=/[぀-ヿ㐀-鿿！-｠]/;
const decode=s=>s.replace(/\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g,(_,u,x)=>String.fromCharCode(parseInt(u??x,16))).replace(/\\n/g,'\n').replace(/\\(['"`\\])/g,'$1');
export async function extract(root=new URL('../dist/',import.meta.url)){
 const found=new Map();
 // Markup reaches the screen as separate text nodes and attributes, so split it into those pieces.
 const add=(s,where)=>{
  if(!JA.test(s))return;
  if(/<[a-zA-Z/][^>]*>/.test(s)){
   for(const m of s.matchAll(/\s(?:title|aria-label|placeholder)="([^"]*)"/g))add(m[1],where);
   for(const piece of s.replace(/<[^>]*>/g,'\u0000').split('\u0000'))add(piece,where);
   return;
  }
  if(!found.has(s))found.set(s,new Set());found.get(s).add(where);
 };
 for(const f of (await readdir(root)).filter(f=>f.endsWith('.js'))){
  const scan=src=>{
   for(const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)){
    const raw=m[1]??m[2]??m[3];if(raw===undefined)continue;
    if(m[3]===undefined){add(decode(raw),f);continue;}
    // Template literals: the static pieces reach the screen, and ${...} may hold more literals.
    for(const p of raw.split(/\$\{(?:[^{}]|\{[^{}]*\})*\}/))add(decode(p),f);
    for(const e of raw.matchAll(/\$\{((?:[^{}]|\{[^{}]*\})*)\}/g))scan(e[1]);
   }
  };
  scan(await readFile(new URL(f,root),'utf8'));
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
 if(i>0)await writeFile(process.argv[i+1],JSON.stringify(Object.fromEntries(missing.map(k=>[k,[...found.get(k)].join(',')])),null,1));
}

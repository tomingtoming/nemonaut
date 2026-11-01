// English display. The UI text is written in Japanese in the code; with English selected, every
// text node, the title/aria-label/placeholder attributes, the document title and canvas text are
// rewritten through dist/i18n/en.json, whose keys are the Japanese source strings (literal pieces
// of concatenations, so dynamic text such as "残り 4.25 m/s" translates piece by piece).
// Japanese display (the default for Japanese browsers) changes nothing.
import {storageKey} from './app-id.js';

const JA=/[぀-ヿ㐀-鿿！-｠]/;
const LANG_KEY=storageKey('lang');
const ATTRIBUTES=['title','aria-label','placeholder'];
// Labels on form fields translate; what the player typed (their value/content) never does.
const SKIP=new Set(['SCRIPT','STYLE']),FIELDS=new Set(['TEXTAREA','INPUT']);

export function currentLanguage(storage=globalThis.localStorage,navigatorLanguage=globalThis.navigator?.language){
 try{const v=storage?.getItem(LANG_KEY);if(v==='ja'||v==='en')return v;}catch{}
 return String(navigatorLanguage||'ja').toLowerCase().startsWith('ja')?'ja':'en';
}
export function setLanguage(language,storage=globalThis.localStorage){
 try{storage.setItem(LANG_KEY,language);}catch{}
 globalThis.location?.reload();
}
// Longest keys first, so "月周回" wins over "月" at the same position.
export function makeTranslator(dictionary){
 const keys=Object.keys(dictionary).filter(k=>JA.test(k)).sort((a,b)=>b.length-a.length);
 if(!keys.length)return s=>s;
 const pattern=new RegExp(keys.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g'),cache=new Map();
 return text=>{
  if(typeof text!=='string'||!JA.test(text))return text;
  let out=cache.get(text);if(out!==undefined)return out;
  out=text.replace(pattern,m=>dictionary[m]);
  if(cache.size>20000)cache.clear();cache.set(text,out);return out;
 };
}
export function translateTree(root,translate){
 const walk=node=>{
  if(node.nodeType===3){const t=translate(node.data);if(t!==node.data)node.data=t;return;}
  if(node.nodeType!==1||SKIP.has(node.tagName))return;
  for(const a of ATTRIBUTES){const v=node.getAttribute(a);if(v){const t=translate(v);if(t!==v)node.setAttribute(a,t);}}
  if(FIELDS.has(node.tagName))return;
  for(const child of node.childNodes)walk(child);
 };
 walk(root);
}
export async function installTranslation({document:doc=globalThis.document,language=currentLanguage(),fetchJson=url=>fetch(url).then(r=>r.json())}={}){
 if(language!=='en'||!doc)return null;
 doc.documentElement.lang='en';
 const translate=makeTranslator(await fetchJson(new URL('./i18n/en.json',import.meta.url)));
 translateTree(doc.documentElement,translate);
 new MutationObserver(records=>{
  for(const r of records){
   if(r.type==='characterData')translateTree(r.target,translate);
   else if(r.type==='attributes')translateTree(r.target,translate);
   else for(const n of r.addedNodes)translateTree(n,translate);
  }
 }).observe(doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRIBUTES});
 // Canvas labels (maps, navball, part windows) are drawn, not in the DOM.
 const proto=globalThis.CanvasRenderingContext2D?.prototype;
 if(proto)for(const name of ['fillText','strokeText','measureText']){const original=proto[name];proto[name]=function(text,...rest){return original.call(this,translate(String(text)),...rest);};}
 return translate;
}

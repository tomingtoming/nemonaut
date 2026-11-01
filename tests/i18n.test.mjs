import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {makeTranslator,currentLanguage,translateTree} from '../dist/i18n.js';
import {extract} from '../tools/i18n-extract.mjs';

const JA=/[぀-ヿ㐀-鿿！-｠]/;
test('longest keys win and concatenated text translates piece by piece',()=>{
 const t=makeTranslator({'月':'Moon','月周回':'lunar orbit','残り ':'Remaining ',' · 開始まで ':' · starts in ','秒':' s'});
 assert.equal(t('月周回へ'),'lunar orbitへ','longest key at the same position');
 assert.equal(t('残り 4.25 m/s · 開始まで 50.6秒'),'Remaining 4.25 m/s · starts in 50.6 s');
 assert.equal(t('Pioneer / 01'),'Pioneer / 01','text without Japanese is untouched');
 assert.equal(makeTranslator({})('月'),'月');
});
test('language comes from the saved choice, else the browser language',()=>{
 const store=v=>({getItem:()=>v});
 assert.equal(currentLanguage(store(null),'ja-JP'),'ja');assert.equal(currentLanguage(store(null),'en-US'),'en');
 assert.equal(currentLanguage(store('ja'),'en-US'),'ja');assert.equal(currentLanguage(store('en'),'ja'),'en');
 assert.equal(currentLanguage({getItem(){throw Error('blocked');}},'fr'),'en');
});
test('text nodes and labels translate; typed input values do not',()=>{
 const t=makeTranslator({'保存':'Save','機体名':'Craft name'});
 const text={nodeType:3,data:'保存'},attrs={'aria-label':'機体名'};
 const button={nodeType:1,tagName:'BUTTON',childNodes:[text],getAttribute:a=>attrs[a]??null,setAttribute:(a,v)=>{attrs[a]=v;}};
 const input={nodeType:1,tagName:'INPUT',value:'保存',childNodes:[],getAttribute:()=>null,setAttribute(){throw Error('inputs are skipped');}};
 translateTree({nodeType:1,tagName:'DIV',childNodes:[button,input],getAttribute:()=>null,setAttribute(){}},t);
 assert.equal(text.data,'Save');assert.equal(attrs['aria-label'],'Craft name');assert.equal(input.value,'保存');
});
test('the English dictionary has no Japanese in values and no keys missing from the code',async()=>{
 const en=JSON.parse(readFileSync(new URL('../dist/i18n/en.json',import.meta.url),'utf8')),found=await extract();
 assert.deepEqual(Object.entries(en).filter(([,v])=>JA.test(v)).map(([k])=>k),[],'Japanese left in values');
 assert.deepEqual(Object.keys(en).filter(k=>!found.has(k)),[],'stale keys: the source text changed');
});

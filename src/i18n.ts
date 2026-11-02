// English display. The UI text is written in Japanese in the code; with English selected, every
// text node, the title/aria-label/placeholder attributes, the document title and canvas text are
// rewritten through dist/i18n/en.json, whose keys are the Japanese source strings (literal pieces
// of concatenations, so dynamic text such as "残り 4.25 m/s" translates piece by piece).
// Japanese display (the default for Japanese browsers) changes nothing.
import {storageKey} from './app-id.js';

export type Language = 'ja' | 'en';
export type Translator = (text: string) => string;
export interface TranslationOptions {
  document?: Document;
  language?: Language;
  fetchJson?: (url: URL) => Promise<Record<string, string>>;
}
// The walk reads Text.data on text nodes and the attribute API on elements, after checking nodeType.
interface TextLike {
  data: string;
}
interface ElementLike {
  tagName: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}
const isTextNode = <N extends Node>(node: N): node is N & TextLike => node.nodeType === 3;
const isElementNode = <N extends Node>(node: N): node is N & ElementLike => node.nodeType === 1;
type CanvasTextMethod = (this: CanvasRenderingContext2D, text: string, ...rest: never[]) => unknown;
const JA = /[぀-ヿ㐀-鿿！-｠]/;
const LANG_KEY = storageKey('lang');
const ATTRIBUTES = ['title', 'aria-label', 'placeholder'];
// Labels on form fields translate; what the player typed (their value/content) never does.
const SKIP = new Set(['SCRIPT', 'STYLE']),
  FIELDS = new Set(['TEXTAREA', 'INPUT']);

export function currentLanguage(
  storage: Storage | null | undefined = globalThis.localStorage,
  navigatorLanguage: string | null | undefined = globalThis.navigator?.language
): Language {
  try {
    const v = storage?.getItem(LANG_KEY);
    if (v === 'ja' || v === 'en') return v;
  } catch {}
  return String(navigatorLanguage || 'ja')
    .toLowerCase()
    .startsWith('ja')
    ? 'ja'
    : 'en';
}
export function setLanguage(language: Language, storage: Storage = globalThis.localStorage): void {
  try {
    storage.setItem(LANG_KEY, language);
  } catch {}
  globalThis.location?.reload();
}
// Longest keys first, so "月周回" wins over "月" at the same position.
export function makeTranslator(dictionary: Record<string, string>): Translator {
  const keys = Object.keys(dictionary)
    .filter(k => JA.test(k))
    .sort((a, b) => b.length - a.length);
  if (!keys.length) return (s: string) => s;
  const pattern = new RegExp(keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g'),
    cache = new Map<string, string>();
  return (text: string) => {
    if (typeof text !== 'string' || !JA.test(text)) return text;
    let out = cache.get(text);
    if (out !== undefined) return out;
    out = text.replace(pattern, m => dictionary[m]);
    if (cache.size > 20000) cache.clear();
    cache.set(text, out);
    return out;
  };
}
export function translateTree(root: Node, translate: Translator): void {
  const walk = (node: Node) => {
    if (isTextNode(node)) {
      const t = translate(node.data);
      if (t !== node.data) node.data = t;
      return;
    }
    if (!isElementNode(node) || SKIP.has(node.tagName)) return;
    for (const a of ATTRIBUTES) {
      const v = node.getAttribute(a);
      if (v) {
        const t = translate(v);
        if (t !== v) node.setAttribute(a, t);
      }
    }
    if (FIELDS.has(node.tagName)) return;
    for (const child of node.childNodes) walk(child);
  };
  walk(root);
}
export async function installTranslation({
  document: doc = globalThis.document,
  language = currentLanguage(),
  fetchJson = (url: URL) => fetch(url).then(r => r.json())
}: TranslationOptions = {}): Promise<Translator | null> {
  if (language !== 'en' || !doc) return null;
  doc.documentElement.lang = 'en';
  const translate = makeTranslator(await fetchJson(new URL('./i18n/en.json', import.meta.url)));
  translateTree(doc.documentElement, translate);
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'characterData') translateTree(r.target, translate);
      else if (r.type === 'attributes') translateTree(r.target, translate);
      else for (const n of r.addedNodes) translateTree(n, translate);
    }
  }).observe(doc.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRIBUTES
  });
  // Canvas labels (maps, navball, part windows) are drawn, not in the DOM.
  const proto: Record<'fillText' | 'strokeText' | 'measureText', CanvasTextMethod> | undefined =
    globalThis.CanvasRenderingContext2D?.prototype;
  if (proto)
    for (const name of ['fillText', 'strokeText', 'measureText'] as const) {
      const original = proto[name];
      proto[name] = function (text: string, ...rest: never[]) {
        return original.call(this, translate(String(text)), ...rest);
      };
    }
  return translate;
}

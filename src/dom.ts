// Typed DOM lookups: the page structure (index.html and markup the panels build) enters the type
// system here, so this is a boundary module (tools/precision.json). Callers name the element kind
// by tag; a missing element, or one whose tag differs, fails with the selector in the message
// instead of a later "cannot read properties of null". Objects without a tagName (test doubles)
// are accepted as they are.
type Tag=keyof HTMLElementTagNameMap;
type Root=Pick<ParentNode,'querySelector'|'querySelectorAll'>;

function checked<K extends Tag>(found:Element|null,selector:string,tag:K):HTMLElementTagNameMap[K]{
 if(!found)throw Error('画面要素が見つかりません: '+selector);
 const actual=(found as {tagName?:unknown}).tagName;
 if(typeof actual==='string'&&actual.toLowerCase()!==tag)throw Error(`画面要素 ${selector} は ${tag} ではなく ${actual.toLowerCase()} です`);
 return found as HTMLElementTagNameMap[K];
}
/** The element matching `selector` under `root`, which must exist and be a `tag`. */
export function element<K extends Tag>(root:Root,selector:string,tag:K):HTMLElementTagNameMap[K]{
 return checked(root.querySelector(selector),selector,tag);
}
/** Every element matching `selector` under `root`; each must be a `tag`. */
export function elements<K extends Tag>(root:Root,selector:string,tag:K):HTMLElementTagNameMap[K][]{
 return [...root.querySelectorAll(selector)].map(e=>checked(e,selector,tag));
}
/** The element with this id, which must exist and be a `tag`. */
export function byId<K extends Tag>(id:string,tag:K,doc:Pick<Document,'getElementById'>=document):HTMLElementTagNameMap[K]{
 return checked(doc.getElementById(id),'#'+id,tag);
}
/** The nearest ancestor (or self) matching `selector`, which must exist and be a `tag`. */
export function closest<K extends Tag>(from:Element,selector:string,tag:K):HTMLElementTagNameMap[K]{
 return checked(from.closest(selector),selector,tag);
}

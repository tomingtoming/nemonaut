// Small DOM helpers shared by the app modules (BACKLOG 7b, moved from app.ts unchanged). No import-time side effects.
import type * as T from 'three';
import {element, elements} from './dom.js';
import {state} from './app-state.js';
export const $ = <K extends keyof HTMLElementTagNameMap>(s: string, tag: K) => element(document, s, tag),
  $$ = <K extends keyof HTMLElementTagNameMap>(s: string, tag: K) => elements(document, s, tag);
export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
export function blurActive() {
  const active = document.activeElement;
  if (active instanceof HTMLElement || active instanceof SVGElement) active.blur();
  else throw Error('フォーカス中の要素を外せません');
}
export function dataValue(el: HTMLElement, key: string): string {
  const value = el.dataset[key];
  if (value === undefined) throw Error('画面要素に data 属性 ' + key + ' がありません');
  return value;
}
export function disposeMaterial(material: T.Material | T.Material[]) {
  for (const m of Array.isArray(material) ? material : [material]) m.dispose();
}
export function notify(msg: string) {
  $('#toast', 'div').textContent = msg;
  $('#toast', 'div').classList.add('show');
  clearTimeout(state.timer);
  state.timer = setTimeout(() => $('#toast', 'div').classList.remove('show'), 3600);
}
/** Reports a failure where the player can see it: the centre notice on the space-centre screen, the toast elsewhere. */
export function reportFailure(msg: string) {
  if (state.atCenter) $('#centerNotice', 'p').textContent = msg;
  else notify(msg);
}
export function showModal(html: string) {
  $('#modal', 'dialog').classList.remove('trackingDialog');
  $('#modalBody', 'div').innerHTML = html;
  $('#modal', 'dialog').showModal();
}

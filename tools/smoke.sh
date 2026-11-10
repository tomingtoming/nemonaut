#!/usr/bin/env bash
# UI smoke check (BACKLOG 7): drives the built game in a browser through the main paths and fails on
# a console error or a missing result. app.ts has no unit tests, so every split step runs this.
# Usage: bash tools/smoke.sh [url]   (default: starts nothing; pass the dev server or public URL)
# Needs playwright-cli; set PWCLI to its path if it is not on PATH.
set -uo pipefail
URL=${1:?usage: bash tools/smoke.sh <url>}
P=${PWCLI:-playwright-cli}
S=smoke$$
fail=0
ev(){ "$P" -s=$S eval "$1" 2>&1 | grep -A1 "### Result" | tail -1; }
expect(){ local label=$1 value=$2 pattern=$3; if [[ $value =~ $pattern ]]; then echo "ok   $label: $value"; else echo "FAIL $label: $value (expected /$pattern/)"; fail=1; fi; }
click(){ ev "()=>{const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&!b.disabled&&b.textContent.trim().startsWith('$1'));b?.click();return b?b.textContent.trim().slice(0,24):'none'}"; }
altitude(){ ev "()=>document.body.innerText.match(/(高度|Altitude)\\s*([\\d.]+)\\s*(k?m)/)?.slice(2).join('')??'none'"; }
"$P" -s=$S open "$URL" >/dev/null 2>&1; sleep 7
ev "()=>{localStorage.clear();location.reload();return 1}" >/dev/null; sleep 7
expect "first steps" "$(ev "()=>document.getElementById('centerFirstSteps')?.hidden===false")" '^"?true"?$'
expect "tracking opens" "$(ev "()=>{document.getElementById('centerTracking').click();const o=document.getElementById('modal').open;document.getElementById('modal').close();return o}")" 'true'
ev "()=>{document.getElementById('enterVAB').click();return 1}" >/dev/null; sleep 3
expect "part selected" "$(ev "()=>{const c=[...document.querySelectorAll('.partcard')][1];c.click();return document.querySelector('.partcard.active, .partcard[aria-pressed=\"true\"]')?'yes':c?'clicked':'none'}")" 'yes|clicked'
"$P" -s=$S press Escape >/dev/null 2>&1
count(){ ev "()=>document.getElementById('assemblyTreeCount').textContent"; }
before=$(count)
ev "()=>{[...document.querySelectorAll('#assemblyTreeRows button')].at(-1).click();document.activeElement?.blur();return 1}" >/dev/null; sleep 1
"$P" -s=$S press Delete >/dev/null 2>&1; sleep 1; deleted=$(count)
"$P" -s=$S press Control+z >/dev/null 2>&1; sleep 1; undone=$(count)
"$P" -s=$S press Control+y >/dev/null 2>&1; sleep 1; redone=$(count)
"$P" -s=$S press Control+z >/dev/null 2>&1; sleep 1
expect "delete/undo/redo" "$before $deleted $undone $redone" '^"7" "6" "7" "6"$'
ev "()=>{[...document.querySelectorAll('.partcard')].find(c=>/小型タンク|Small tank/.test(c.textContent))?.click();return 1}" >/dev/null; sleep 1
# Place on the top attachment node of the default rocket (the canvas takes pointer events, not page clicks).
expect "place part" "$(ev "()=>{const c=[...document.querySelectorAll('canvas')].find(c=>c.offsetParent&&c.getBoundingClientRect().width>600);const o={clientX:633,clientY:212,bubbles:true,button:0,pointerId:1,isPrimary:true};for(const t of ['pointermove','pointerdown','pointerup'])c?.dispatchEvent(new PointerEvent(t,o));return new Promise(r=>setTimeout(()=>r(document.getElementById('assemblyTreeCount').textContent),800))}")" '^"8"$'
"$P" -s=$S press Control+z >/dev/null 2>&1; sleep 1
expect "example dialog" "$(click 見本機)" '見本機'
ev "()=>{document.querySelector('[data-example=\"rocket\"]')?.click();document.getElementById('modal').open&&document.getElementById('modal').close();return 1}" >/dev/null; sleep 2
expect "save craft" "$(click 保存)" '保存'
ev "()=>{document.getElementById('launch').click();return 1}" >/dev/null; sleep 6
"$P" -s=$S press Space >/dev/null 2>&1; "$P" -s=$S press z >/dev/null 2>&1; sleep 6
expect "climbing" "$(altitude)" '^"?[0-9.]+k?m"?$'
"$P" -s=$S press F5 >/dev/null 2>&1; sleep 1
"$P" -s=$S press m >/dev/null 2>&1; sleep 2
expect "map open" "$(ev "()=>!!document.querySelector('#orbitOverlay:not([hidden])')||document.body.classList.contains('map-open')||!document.getElementById('orbitOverlay')?.hidden")" 'true'
"$P" -s=$S press m >/dev/null 2>&1; sleep 1
"$P" -s=$S press F9 >/dev/null 2>&1; sleep 2
expect "quick load" "$(ev "()=>document.getElementById('toast')?.textContent")" '復元|restored'
click 宇宙センター >/dev/null; sleep 2
ev "()=>{document.getElementById('centerTracking').click();return 1}" >/dev/null; sleep 1
expect "resume from tracking" "$(click 観察を再開)" '観察'
sleep 3
expect "resumed flight" "$(altitude)" '^"?[0-9.]+k?m"?$'
click 探査計画 >/dev/null; sleep 1
ev "()=>{localStorage.setItem('nemonaut-lang','en');location.reload();return 1}" >/dev/null; sleep 7
expect "english center" "$(ev "()=>{const JA=/[぀-ヿ㐀-鿿]/;const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n,c=0;while(n=w.nextNode())if(JA.test(n.data)&&n.parentNode.tagName!=='SCRIPT')c++;return c}")" '^"?0"?$'
ev "()=>{localStorage.setItem('nemonaut-lang','ja');return 1}" >/dev/null
errors=$("$P" -s=$S console 2>&1 | grep -o "Errors: [0-9]*" | head -1)
expect "console" "$errors" 'Errors: 0'
"$P" -s=$S close >/dev/null 2>&1
exit $fail

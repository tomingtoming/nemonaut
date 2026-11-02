// The first two minutes. A first visit (nothing flown, recorded, held or saved) gets a short path at
// the space center: the VAB already holds the example rocket, so open it, depart, throttle up, ignite.
export const FIRST_STEPS = [
  ['組立棟（VAB）を開く', '見本ロケット Pioneer が組み上がっています。部品は左の一覧から足せます。'],
  ['右上の「出発」', '発射台に機体が置かれ、飛行が始まります。'],
  ['Zで全開、Spaceで点火', 'Xでスロットルを切り、WASDQEで姿勢を変えます。「? 操作」に全キーがあります。']
];
export function isFirstVisit({historyCount = 0, vesselCount = 0, designCount = 0} = {}) {
  return !historyCount && !vesselCount && !designCount;
}
// The first ignition with the throttle at 0 lights the engines without thrust, so nothing seems to happen.
export function ignitionHint({firstStage, throttle}: {firstStage: boolean; throttle: number}): string {
  return firstStage && throttle === 0 ? 'スロットル0%です。Zで全開、Xで停止' : '';
}
export function renderFirstSteps(
  host: HTMLElement,
  {visible, onStart}: {visible: boolean; onStart: () => void}
): void {
  host.hidden = !visible;
  if (!visible) return;
  const title = document.createElement('h2'),
    list = document.createElement('ol'),
    start = document.createElement('button');
  title.textContent = 'はじめての方へ';
  list.className = 'centerGuide';
  for (const [step, detail] of FIRST_STEPS) {
    const row = document.createElement('li'),
      b = document.createElement('b'),
      span = document.createElement('span');
    b.textContent = step;
    span.textContent = detail;
    row.append(b, span);
    list.append(row);
  }
  start.className = 'primary';
  start.textContent = '組立棟で見本ロケットを開く';
  start.onclick = onStart;
  host.replaceChildren(title, list, start);
}

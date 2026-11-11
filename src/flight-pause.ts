import {element, closest, setText} from './dom.js';
export interface FlightPauseOptions {
  keys: {clear(): void};
  clock: {reset(): void};
  onChange?: () => void;
}
export interface FlightPauseControl {
  readonly paused: boolean;
  set(value: unknown): void;
  refresh(): void;
  toggle(): void;
}
export function mountFlightPause(
  root: Document,
  {keys, clock, onChange}: FlightPauseOptions
): FlightPauseControl {
  let paused = false;
  const button = root.createElement('button');
  button.id = 'flightPause';
  button.type = 'button';
  closest(element(root, '#warp', 'select'), 'label', 'label').after(button);
  // The frame loop calls this every frame while paused: the button, which only this function labels, is
  // written when the state changes.
  let shown: boolean | null = null;
  const warp = element(root, '#warp', 'select'),
    warpStatus = element(root, '#warpStatus', 'small');
  function refresh() {
    if (shown !== paused) {
      shown = paused;
      button.textContent = paused ? '▶ P' : 'Ⅱ P';
      button.setAttribute('aria-label', paused ? '飛行を再開 P' : '飛行を一時停止 P');
      button.setAttribute('aria-pressed', String(paused));
      button.title = paused ? '全機体を再開（1倍速）' : '全機体の時刻・物理・資源を停止';
    }
    warp.disabled = paused;
    if (paused) setText(warpStatus, '一時停止 · Pで再開');
  }
  function set(value: unknown): void {
    paused = !!value;
    keys.clear();
    clock.reset();
    element(root, '#warp', 'select').value = '1';
    element(root, '#warpStatus', 'small').textContent = paused ? '一時停止 · Pで再開' : '通常速度 · 1倍';
    refresh();
    onChange?.();
  }
  button.onclick = () => {
    set(!paused);
    button.blur();
  };
  refresh();
  return {
    get paused() {
      return paused;
    },
    set,
    refresh,
    toggle() {
      set(!paused);
    }
  };
}

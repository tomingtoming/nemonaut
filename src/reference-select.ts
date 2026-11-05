import {referenceDirections} from './command-frame.js';
export function referenceSelect(host: HTMLElement, change: (direction: number) => void) {
  const label = document.createElement('label'),
    select = document.createElement('select');
  label.append('操縦基準', select);
  ['自動', ...referenceDirections].forEach((name, i) => select.add(new Option(name, String(i - 1))));
  select.onchange = () => change(Number(select.value));
  host.append(label);
  return select;
}

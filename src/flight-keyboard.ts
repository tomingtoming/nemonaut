export const wheelBrake = {code: 'KeyB', button: 'brake', action: 'ブレーキ'} as const;
export const landingGear = {code: 'KeyG', button: 'gear', action: 'ギアの出し入れ'} as const;
// W/S and A/D feed both attitude and wheel commands. Equipment switches gate the actuators downstream.
export const pitchKeys = ['KeyW', 'KeyS'] as const;
export const yawKeys = ['KeyA', 'KeyD'] as const;
type AxisKeys = readonly [string, string];
export function keyAxis(held: ReadonlySet<string>, [positive, negative]: AxisKeys): number {
  return Number(held.has(positive)) - Number(held.has(negative));
}
export function axisLabel(pair: AxisKeys, separator = ' / '): string {
  return pair.map(code => code.slice(3)).join(separator);
}
const flightKeys = new Set([
  ...pitchKeys,
  ...yawKeys,
  'KeyQ',
  'KeyE',
  'KeyI',
  'KeyK',
  'KeyJ',
  'KeyL',
  'KeyU',
  'KeyO',
  'KeyZ',
  'KeyX',
  'KeyP',
  'KeyM',
  'KeyR',
  'KeyH',
  wheelBrake.code,
  'KeyT',
  'KeyF',
  landingGear.code,
  'KeyV',
  'CapsLock',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight'
]);

export function acceptsFlightKey(target: EventTarget | null, code: string): boolean {
  if (!target) throw Error('キー入力の対象がありません');
  if ('isContentEditable' in target && target.isContentEditable) return false;
  const tag = 'tagName' in target ? target.tagName : undefined;
  if (tag === 'INPUT') return 'type' in target && target.type === 'range' && flightKeys.has(code);
  return tag !== 'SELECT' && tag !== 'TEXTAREA';
}

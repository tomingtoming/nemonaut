const flightKeys = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
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
  'KeyB',
  'KeyT',
  'KeyF',
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

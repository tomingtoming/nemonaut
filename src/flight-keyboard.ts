export const wheelBrake = {code: 'KeyB', button: 'brake', action: 'ブレーキ'} as const;
export const flapControl = {
  code: 'KeyF',
  button: 'flaps',
  action: 'フラップ',
  capability: 'flapAngles'
} as const;
export const landingGear = {code: 'KeyG', button: 'gear', action: 'ギアの出し入れ'} as const;
export const armChutes = {
  code: 'KeyH',
  button: 'armChutes',
  action: 'パラシュート待機',
  capability: 'parachute'
} as const;
export const toggleRcs = {
  code: 'KeyR',
  input: 'rcsEnabled',
  action: 'RCS 入 / 切',
  capability: 'rcsThrust'
} as const;
// W/S and A/D feed both attitude and wheel commands. Equipment switches gate the actuators downstream.
export const pitchKeys = ['KeyW', 'KeyS'] as const;
export const yawKeys = ['KeyA', 'KeyD'] as const;
export const rollKeys = ['KeyQ', 'KeyE'] as const;
export const forwardKeys = ['KeyI', 'KeyK'] as const;
export const leftKeys = ['KeyJ', 'KeyL'] as const;
export const upKeys = ['KeyU', 'KeyO'] as const;
export const throttleKeys = ['KeyZ', 'KeyX'] as const;
export const throttleUp = {codes: ['ShiftLeft', 'ShiftRight'], label: 'Shift'} as const;
export const throttleDown = {codes: ['KeyC'], label: 'C'} as const;
export const stageKey = 'Space';
export const sasKey = 'KeyT';
// Frames the camera on the craft. F is the flaps in flight, so the workshop's F is V here.
export const cameraFrameKey = 'KeyV';
type AxisKeys = readonly [string, string];
export function keyAxis(held: ReadonlySet<string>, [positive, negative]: AxisKeys): number {
  return Number(held.has(positive)) - Number(held.has(negative));
}
export function axisLabel(pair: AxisKeys, separator = ' / '): string {
  return pair.map(code => code.slice(3)).join(separator);
}
export const attitudeKeyLabel = [pitchKeys, yawKeys, rollKeys].map(pair => axisLabel(pair, '/')).join(' · ');
export const translationKeyLabel = [forwardKeys, leftKeys, upKeys]
  .map(pair => axisLabel(pair, '/'))
  .join(' · ');
export const throttleAdjustLabel = throttleUp.label + ' / ' + throttleDown.label;
const flightKeys = new Set([
  ...pitchKeys,
  ...yawKeys,
  ...rollKeys,
  ...forwardKeys,
  ...leftKeys,
  ...upKeys,
  ...throttleKeys,
  'KeyP',
  'KeyM',
  toggleRcs.code,
  armChutes.code,
  wheelBrake.code,
  sasKey,
  flapControl.code,
  landingGear.code,
  cameraFrameKey,
  'CapsLock',
  ...throttleUp.codes,
  ...throttleDown.codes
]);

export function acceptsFlightKey(target: EventTarget | null, code: string): boolean {
  if (!target) throw Error('キー入力の対象がありません');
  if ('isContentEditable' in target && target.isContentEditable) return false;
  const tag = 'tagName' in target ? target.tagName : undefined;
  if (tag === 'INPUT') return 'type' in target && target.type === 'range' && flightKeys.has(code);
  return tag !== 'SELECT' && tag !== 'TEXTAREA';
}

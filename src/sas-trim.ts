import * as T from 'three';

// Controller memory is transient: load/separation starts from zero, not stale trim.
export interface SasTrimVessel {
  sas: boolean;
  sasMode: string;
}
export interface SasTrimCommands {
  pitch: number;
  yaw: number;
  roll: number;
}
export interface SasTrimAxes {
  x: boolean;
  y: boolean;
  z: boolean;
}
interface TrimState {
  mode: string;
  value: T.Vector3;
}
const memory = new WeakMap<SasTrimVessel, TrimState>();
const pending = new WeakMap<SasTrimVessel, TrimState>();
// Explicit handoff only. Match the previous actuator output against the next
// SAS proportional/rate term, instead of transferring unrelated integrators.
export function seedSasTrim(v: SasTrimVessel, commands: SasTrimCommands | null | undefined): boolean {
  if (
    !v.sas ||
    v.sasMode !== 'hold' ||
    !commands ||
    !(['pitch', 'yaw', 'roll'] as const).every(
      k => Number.isFinite(commands[k]) && Math.abs(commands[k]) <= 1
    )
  )
    return false;
  pending.set(v, {mode: v.sasMode, value: new T.Vector3(commands.pitch, commands.yaw, commands.roll)});
  return true;
}
export function sasTrim(
  v: SasTrimVessel,
  error: T.Vector3,
  base: T.Vector3,
  axes: SasTrimAxes,
  dt: number,
  enabled: boolean
): T.Vector3;
/** Disabled trim only clears the controller memory, so it needs no error/base/axes. */
export function sasTrim(
  v: SasTrimVessel,
  error: null,
  base: null,
  axes: null,
  dt: number,
  enabled: false
): T.Vector3;
// error/base/axes are null only with enabled=false (the overloads), which returns before reading them.
export function sasTrim(
  v: SasTrimVessel,
  error: T.Vector3 | null,
  base: T.Vector3 | null,
  axes: SasTrimAxes | null,
  dt: number,
  enabled: boolean
): T.Vector3 {
  if (!enabled) {
    memory.delete(v);
    pending.delete(v);
    return new T.Vector3();
  }
  if (!error || !base || !axes) throw Error('SASトリムの誤差・基準・軸がありません');
  let state = memory.get(v);
  if (!state || state.mode !== v.sasMode) {
    state = {mode: v.sasMode, value: new T.Vector3()};
    memory.set(v, state);
  }
  const seed = pending.get(v);
  pending.delete(v);
  if (seed?.mode === v.sasMode)
    for (const axis of ['x', 'y', 'z'] as const)
      state.value[axis] = axes[axis] ? T.MathUtils.clamp(seed.value[axis] - base[axis], -0.8, 0.8) : 0;
  for (const axis of ['x', 'y', 'z'] as const) {
    if (!axes[axis]) {
      state.value[axis] = 0;
      continue;
    }
    const output = base[axis] + state.value[axis];
    // Do not accumulate into saturation; an opposing error may unwind it.
    if (Math.abs(output) < 1 || Math.sign(error[axis]) !== Math.sign(output))
      state.value[axis] = T.MathUtils.clamp(state.value[axis] + error[axis] * 0.8 * dt, -0.8, 0.8);
  }
  return state.value;
}

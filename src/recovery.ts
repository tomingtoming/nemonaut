import * as T from 'three';
export const chuteNames = {
  stowed: '収納',
  armed: '安全条件待ち',
  reefed: '縮帆展開',
  open: '全開',
  landed: '着地',
  cut: '切離し済み'
};
export type ChuteStatus = keyof typeof chuteNames;
export interface ParachuteState {
  status: ChuteStatus;
  fraction: number;
}
export interface ParachuteConditions {
  altitude: number;
  speed: number;
  vertical: number;
  density: number;
}
const waitReasons = new WeakMap<ParachuteState, string>();
export const parachuteWaitReason = (state: ParachuteState): string => waitReasons.get(state) || '';
export function parachuteBlocker({altitude, speed, vertical, density}: ParachuteConditions): string {
  if (!(density > 0.03)) return '大気不足';
  if (!(altitude < 5000)) return '高度5 km以上';
  if (!(vertical < 0)) return '降下待ち';
  if (!(speed < 250)) return '速度250 m/s以上';
  if (!(0.5 * density * speed * speed < 35000)) return '動圧過大';
  return '';
}
export function parachuteStep(
  state: ParachuteState,
  {altitude, speed, vertical, density, landed}: ParachuteConditions & {landed: boolean},
  dt: number
): void {
  if (state.status === 'cut') {
    state.fraction = 0;
    return;
  }
  if (landed && state.fraction > 0) {
    state.status = 'landed';
    state.fraction = 0;
    return;
  }
  const reason = state.status === 'armed' ? parachuteBlocker({altitude, speed, vertical, density}) : '';
  waitReasons.set(state, reason);
  if (state.status === 'armed' && !reason) state.status = 'reefed';
  if (state.status === 'reefed' && altitude < 1500 && speed < 80) state.status = 'open';
  const target = state.status === 'open' ? 1 : state.status === 'reefed' ? 0.08 : 0;
  state.fraction += T.MathUtils.clamp(target - state.fraction, -dt / 3, dt / 3);
}
export function parachuteDrag(
  velocity: T.Vector3,
  density: number,
  area: number,
  fraction: number,
  mass: number,
  dt: number
): T.Vector3 {
  const speed = velocity.length();
  if (!speed || !fraction) return new T.Vector3();
  const force = Math.min(
    0.5 * density * speed * speed * area * 1.5 * fraction,
    (mass * speed) / (Math.max(dt, 1e-6) * 2)
  );
  return velocity.clone().multiplyScalar(-force / speed);
}

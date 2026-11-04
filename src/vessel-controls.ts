// The controls this vessel can use (BACKLOG 9a). Craft are not classified as rocket / rover / plane / sub:
// every row comes from the parts present (powered wheels, steerable wheels, engines, screws, control
// surfaces, reaction wheels, RCS, parachutes, docking ports), so a plane with powered wheels gets the drive
// rows and a rocket with a ballast tank gets the ballast row. Keys on a keyboard, on-screen names on touch
// (touch-flight.ts). Pure: no DOM, no import-time side effects.
import {PARTS, type Part} from './catalog.js';
import {hasRetractableGear} from './landing-gear.js';

/** One row of the panel: what it does and how (keys, or the on-screen control on touch). */
export interface ControlRow {
  action: string;
  how: string;
}
type VesselParts = readonly Pick<Part, 'type' | 'stage' | 'driveEnabled'>[];

/** A wheel that drives (the drive wheel type, its own drive switch not off). */
export function hasPoweredWheel(parts: VesselParts): boolean {
  return parts.some(p => p.type === 'wheel' && p.driveEnabled !== false);
}
/** Whether a part acts when its stage runs (engine, separation, parachute). */
const staged = (p: Pick<Part, 'type'>) => {
  const d = PARTS[p.type];
  return !!(d.thrust || d.decoupler || d.parachute);
};
/** Whether Space still has something to run: a staged part in a later stage than the current one. */
export function hasNextStage(parts: VesselParts, stage: number): boolean {
  return parts.some(p => staged(p) && p.stage > stage);
}

/** The vessel fields the drive gate reads. */
export interface DriveVessel {
  brake: boolean;
  driveEnabled: boolean;
  parts: VesselParts;
}
/**
 * Pressing W/S (drive input not 0) with the brake on releases the brake when a powered wheel can drive.
 * Powered wheels drive without the Space start (core.ts); engines still need their stage. Returns true
 * when it released the brake (the caller updates the brake button and says so).
 */
export function releaseBrakeForDrive(v: DriveVessel, drive: number): boolean {
  if (!drive || !v.brake || !v.driveEnabled || !hasPoweredWheel(v.parts)) return false;
  v.brake = false;
  return true;
}

export interface ControlOptions {
  /** On-screen control names instead of key letters. */
  touch?: boolean;
  /** The current stage (Flight.stage; -1 before the first). */
  stage?: number;
}
/** The rows of 「この機体で使える操作」 for the parts present. */
export function vesselControls(
  parts: VesselParts,
  {touch = false, stage = -1}: ControlOptions = {}
): ControlRow[] {
  const has = (test: (d: (typeof PARTS)[string]) => unknown) => parts.some(p => test(PARTS[p.type])),
    rows: ControlRow[] = [],
    powered = hasPoweredWheel(parts),
    // The touch stick is captioned 走行 whenever a drive wheel is fitted (touch-flight.ts).
    stick = parts.some(p => p.type === 'wheel') ? '「走行」スティック' : '「姿勢」スティック';
  if (powered) {
    rows.push({action: '前後に走る', how: touch ? stick + 'を上下' : 'W / S'});
    if (has(d => d.steer)) rows.push({action: '曲がる', how: touch ? stick + 'を左右' : 'A / D'});
  } else if (has(d => d.wheel && d.steer))
    rows.push({action: '地上で曲がる', how: touch ? stick + 'を左右' : 'A / D'});
  if (has(d => d.wheel)) rows.push({action: 'ブレーキ', how: touch ? '「BRAKE」ボタン' : 'B'});
  if (hasRetractableGear(parts))
    rows.push({action: 'ギアの出し入れ', how: touch ? '「ギア上げ / 下げ」ボタン' : 'G'});
  const air = has(d => d.thrust && !d.water),
    water = has(d => d.thrust && d.water);
  if (air || water) {
    rows.push(
      {action: '全推力 / 停止', how: touch ? '「全推力」「推力0」ボタン' : 'Z / X'},
      {action: '推力を少しずつ', how: touch ? '推力のつまみ' : 'Shift / Ctrl'}
    );
    if (water) rows.push({action: 'スクリュー', how: '水中でだけ働く'});
  }
  if (hasNextStage(parts, stage))
    rows.push({
      action: stage < 0 && (air || water) ? 'エンジン始動 / 次段' : '次段',
      how: touch ? '「次段」ボタン' : 'Space'
    });
  const rcs = has(d => d.rcsThrust);
  if (has(d => d.reactionTorque || d.controlAxis || d.gimbal) || rcs) {
    rows.push({
      action: powered ? '向きを変える（走行と共通）' : '向きを変える',
      how: touch ? stick + '・↺↻' : 'W/S · A/D · Q/E'
    });
    rows.push({action: '姿勢保持（SAS）', how: touch ? '「SAS」ボタン' : 'T'});
  }
  if (rcs) {
    rows.push({action: 'RCS 入 / 切', how: touch ? '「RCS」の切替' : 'R'});
    rows.push({action: 'RCSで平行移動', how: touch ? '「RCS並進」ボタン' : 'I/K · J/L · U/O'});
  }
  if (has(d => d.ballast)) rows.push({action: '浮く / 沈む', how: '「機器」のバラスト'});
  if (has(d => d.parachute))
    rows.push({action: 'パラシュート待機', how: touch ? '「パラシュート待機」ボタン' : 'H'});
  if (has(d => d.docking)) rows.push({action: 'ドッキング', how: '「ドッキング」ボタン'});
  rows.push(
    {action: '一時停止', how: touch ? '「Ⅱ」ボタン' : 'P'},
    {action: '軌道マップ', how: touch ? '「軌道マップ」ボタン' : 'M'},
    touch
      ? {action: '視点を動かす', how: '画面をドラッグ・2本指で拡大'}
      : {action: 'カメラを機体に合わせる', how: 'V'}
  );
  return rows;
}

/** The launch toast: how this vessel starts, from its parts (empty when the panel says it all). */
export function launchHint(parts: VesselParts, touch = false): string {
  const powered = hasPoweredWheel(parts),
    engine = parts.some(p => PARTS[p.type].thrust);
  const drive = powered
      ? touch
        ? '「走行」スティックで走れます'
        : 'W/Sで走れます（ブレーキは自動で解除）'
      : '',
    start = engine ? (touch ? '「次段」でエンジン始動' : 'Spaceでエンジン始動') : '';
  return [drive, start].filter(Boolean).join(' · ');
}

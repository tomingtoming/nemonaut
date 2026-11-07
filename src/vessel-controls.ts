import {
  flapControl,
  stageKey,
  sasKey,
  throttleKeys,
  attitudeKeyLabel,
  translationKeyLabel,
  throttleAdjustLabel,
  armChutes,
  toggleRcs,
  landingGear,
  wheelBrake,
  axisLabel,
  pitchKeys,
  yawKeys
} from './flight-keyboard.js';
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
type VesselParts = readonly Pick<Part, 'type' | 'stage' | 'driveEnabled' | 'steeringEnabled'>[];

/** A wheel with a motor capability and its own drive switch not off. */
export function hasPoweredWheel(parts: VesselParts): boolean {
  return parts.some(p => PARTS[p.type].poweredWheel === true && p.driveEnabled !== false);
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
  driveEnabled?: boolean;
  steeringEnabled?: boolean;
}
/** The rows of 「この機体で使える操作」 for the parts present. */
export function vesselControls(
  parts: VesselParts,
  {touch = false, stage = -1, driveEnabled = true, steeringEnabled = true}: ControlOptions = {}
): ControlRow[] {
  const has = (test: (d: (typeof PARTS)[string]) => unknown) => parts.some(p => test(PARTS[p.type])),
    rows: ControlRow[] = [],
    powered = driveEnabled && hasPoweredWheel(parts),
    steerable = steeringEnabled && parts.some(p => PARTS[p.type].steer && p.steeringEnabled !== false),
    // The touch stick is captioned 走行 whenever a drive wheel is fitted (touch-flight.ts).
    stick = parts.some(p => PARTS[p.type].poweredWheel === true)
      ? '「走行」スティック'
      : '「姿勢」スティック';
  if (powered) {
    rows.push({action: '前後に走る', how: touch ? stick + 'を上下' : axisLabel(pitchKeys)});
    if (steerable) rows.push({action: '曲がる', how: touch ? stick + 'を左右' : axisLabel(yawKeys)});
  } else if (steerable)
    rows.push({action: '地上で曲がる', how: touch ? stick + 'を左右' : axisLabel(yawKeys)});
  if (has(d => d.wheel))
    rows.push({action: wheelBrake.action, how: touch ? '「BRAKE」ボタン' : wheelBrake.code.slice(3)});
  if (has(d => d[flapControl.capability]))
    rows.push({action: flapControl.action, how: touch ? '「FLAP」ボタン' : flapControl.code.slice(3)});
  if (hasRetractableGear(parts))
    rows.push({
      action: landingGear.action,
      how: touch ? '「ギア上げ / 下げ」ボタン' : landingGear.code.slice(3)
    });
  const air = has(d => d.thrust && d.thrustMedium !== 'water'),
    water = has(d => d.thrust && d.thrustMedium === 'water');
  if (air || water) {
    rows.push(
      {action: '全推力 / 停止', how: touch ? '「全推力」「推力0」ボタン' : axisLabel(throttleKeys)},
      {action: '推力を少しずつ', how: touch ? '推力のつまみ' : throttleAdjustLabel}
    );
    if (water) rows.push({action: 'スクリュー', how: '水中でだけ働く'});
  }
  if (hasNextStage(parts, stage))
    rows.push({
      action: stage < 0 && (air || water) ? 'エンジン始動 / 次段' : '次段',
      how: touch ? '「次段」ボタン' : stageKey
    });
  const rcs = has(d => d[toggleRcs.capability]);
  if (has(d => d.reactionTorque || d.controlAxis || d.gimbal) || rcs) {
    rows.push({
      action: powered ? '向きを変える（走行と共通）' : '向きを変える',
      how: touch ? stick + '・↺↻' : attitudeKeyLabel
    });
    rows.push({action: '姿勢保持（SAS）', how: touch ? '「SAS」ボタン' : sasKey.slice(3)});
  }
  if (rcs) {
    rows.push({action: toggleRcs.action, how: touch ? '「RCS」の切替' : toggleRcs.code.slice(3)});
    rows.push({action: 'RCSで平行移動', how: touch ? '「RCS並進」ボタン' : translationKeyLabel});
  }
  if (has(d => d.ballast)) rows.push({action: '浮く / 沈む', how: '「機器」のバラスト'});
  if (has(d => d[armChutes.capability]))
    rows.push({
      action: armChutes.action,
      how: touch ? `「${armChutes.action}」ボタン` : armChutes.code.slice(3)
    });
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
export function launchHint(parts: VesselParts, touch = false, driveEnabled = true): string {
  const powered = driveEnabled && hasPoweredWheel(parts),
    engine = parts.some(p => PARTS[p.type].thrust);
  const drive = powered
      ? touch
        ? '「走行」スティックで走れます'
        : `${axisLabel(pitchKeys, '/')}で走れます（ブレーキは自動で解除）`
      : '',
    start = engine ? (touch ? '「次段」でエンジン始動' : `${stageKey}でエンジン始動`) : '';
  return [drive, start].filter(Boolean).join(' · ');
}

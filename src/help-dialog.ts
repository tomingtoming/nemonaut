import {
  flapControl,
  stageKey,
  sasKey,
  cameraFrameKey,
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
// 「? 操作」: the full list of keys for the workshop and for flight in the #modal dialog, with
// the touch gestures and on-screen buttons instead on a touch device. The part-dependent subset is in
// 「この機体で使える操作」 (vessel-controls-panel.ts). Static text only; no import-time side effects.
import {showModal} from './ui-common.js';

type Rows = readonly (readonly [string, string])[];
const WORKSHOP_KEYS: Rows = [
  ['クリック', '部品を選ぶ / 部品カードの次に取付位置をクリックして置く'],
  ['右ドラッグ / ホイール', '視点を回す / 拡大縮小'],
  ['中ドラッグ', '視点を平行移動'],
  ['部品を右クリック', '部品の設定窓（飛行中は操作窓）'],
  ['分離リングの「燃料通過」', '入にすると分離リングを越えて燃料が流れ、外側のタンクから先に消費'],
  ['設定窓の「アクショングループ」', '部品の操作に番号を割り当てる。飛行中、その番号のキーでまとめて作動'],
  ['G / E / Esc', '移動 / 回転 / 配置の取消・選択に戻る'],
  ['X / Shift+X', '対称の数を増やす / 減らす'],
  ['R / C', '軸対称・鏡面の切替 / スナップの切替'],
  ['V', '対称の中心を切替：機体の中心軸 / 取り付ける親部品の軸'],
  ['F / Delete', '機体全体を表示 / 選んだ接続枝を削除'],
  ['Ctrl+Z / Ctrl+Y', '元に戻す / やり直す'],
  ['矢印キー', '視点を回す']
];
const FLIGHT_KEYS: Rows = [
  [
    `${axisLabel(pitchKeys)} · ${axisLabel(yawKeys)}`,
    '動力付きの車輪で前後・操舵（Spaceは要らない。ブレーキは自動で解除）'
  ],
  [flapControl.code.slice(3), 'フラップを1段展開（3段の次は格納）'],
  [wheelBrake.code.slice(3), wheelBrake.action],
  [landingGear.code.slice(3), 'ランディングギアの出し入れ（接地中は格納できない）'],
  [stageKey, 'エンジン始動 / 次段'],
  [axisLabel(throttleKeys), '全推力 / 推力0'],
  [throttleAdjustLabel, '推力を上げる / 下げる'],
  [attitudeKeyLabel, 'ピッチ · ヨー · ロール（姿勢制御・操舵面）'],
  [sasKey.slice(3), 'SAS（姿勢保持）'],
  [toggleRcs.code.slice(3), toggleRcs.action],
  [translationKeyLabel, 'RCSで平行移動'],
  [armChutes.code.slice(3), armChutes.action],
  ['1 〜 9 · 0', 'アクショングループを作動（割り当ては部品の設定窓・操作窓）'],
  ['CapsLock', '精密操縦（姿勢操作を25%に）'],
  ['P', '一時停止'],
  ['M', '軌道マップ'],
  [cameraFrameKey.slice(3), 'カメラを機体に合わせる'],
  ['矢印キー / 右ドラッグ', '視点を回す'],
  ['F5 / F9', '飛行保存 / 飛行復帰']
];
const WORKSHOP_TOUCH: Rows = [
  ['タップ', '部品を選ぶ'],
  ['部品カード → タップ', '取付位置に仮置き。もう一度タップで決定、「取消」でやめる'],
  ['1本指ドラッグ', '視点を回す'],
  ['2本指', '拡大縮小 · 平行移動'],
  ['長押し', '部品の設定窓'],
  [
    '設定窓の「アクショングループ」',
    '部品の操作に番号を割り当てる。飛行中、左の番号つきボタンでまとめて作動'
  ],
  ['下のツールバー', '移動 · 回転 · 対称 · スナップ'],
  ['「機体」/「親部品」', '対称の中心を切替：機体の中心軸 / 取り付ける親部品の軸'],
  ['↶ / ↷', '元に戻す / やり直す']
];
const FLIGHT_TOUCH: Rows = [
  ['「走行」スティック', '動力付きの車輪で前後・操舵（「次段」は要らない。ブレーキは自動で解除）'],
  ['「姿勢」スティック · ↺↻', 'ピッチ · ヨー · ロール'],
  ['「次段」', 'エンジン始動 / 次段'],
  ['「全推力」「推力0」', '全推力 / 推力0。細かくは推力のつまみ'],
  ['「BRAKE」「SAS」「RCS」', 'ブレーキ · 姿勢保持 · RCS の切替'],
  ['「FLAP」', 'フラップを1段展開（3段の次は格納）'],
  ['「ギア上げ」「ギア下げ」', 'ランディングギアの出し入れ（ギアのある機体だけ。接地中は格納できない）'],
  ['「SAS方向」', '順行・逆行などの向きを選ぶ'],
  ['「RCS並進」ボタン', 'RCSで平行移動（RCSを入れると出る）'],
  ['部品を長押し', '部品の操作窓'],
  ['左の番号つきボタン', 'アクショングループを作動（割り当てた機体だけに出る）'],
  ['画面をドラッグ · 2本指', '視点を回す · 拡大'],
  ['「⊙」', 'カメラを機体に合わせる'],
  ['「軌道マップ」', 'ピンチで拡大、ダブルタップで中心へ'],
  ['「Ⅱ」', '一時停止']
];
const grid = (rows: Rows) =>
  '<div class="helpgrid">' + rows.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join('') + '</div>';

/** Opens the controls list: flight first while flying, touch names on a touch device. */
export function openHelp({touch, flying}: {touch: boolean; flying: boolean}): void {
  const workshop = '<h3>組立棟</h3>' + grid(touch ? WORKSHOP_TOUCH : WORKSHOP_KEYS),
    flight = '<h3>飛行</h3>' + grid(touch ? FLIGHT_TOUCH : FLIGHT_KEYS);
  showModal(
    '<h2>操作</h2><p>飛行中は左の「この機体で使える操作」に、今の機体で使える操作だけが出ます。</p>' +
      (flying ? flight + workshop : workshop + flight) +
      '<p><small>匿名の利用統計を集めています（入力した名前や機体の設計は送りません）。止めるには、アドレスの末尾に ?metrics=off を付けて一度開いてください。</small></p>'
  );
}
export function wireHelp(button: HTMLElement, body: HTMLElement = document.body): void {
  button.onclick = () =>
    openHelp({touch: body.classList.contains('touch'), flying: body.classList.contains('flying')});
}

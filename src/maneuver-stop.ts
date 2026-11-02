import {canControl, type ControllableVessel} from './fleet.js';
export interface StopFlight extends ControllableVessel {
  maneuver?: import('./maneuver-node.js').ManeuverNodeRecord | null;
  throttle: number;
  lastThrust: number;
  stats: {mass: number};
}
export type ManeuverStopKind = 'capture' | 'returnPlan' | 'departure';

export function remainingBurnSeconds(f: StopFlight): number | null {
  const n = f?.maneuver;
  if (!n || n.complete || f.throttle <= 0 || f.lastThrust <= 0) return null;
  const left = Math.hypot(...n.remaining),
    force = f.lastThrust,
    acceleration = force / f.stats.mass;
  return Number.isFinite(acceleration) && acceleration > 0 ? left / acceleration : null;
}

// Explicit opt-in per plan. Never lights an engine or chooses its throttle.
export function mountManeuverStop(
  panel: HTMLElement,
  getFlight: () => StopFlight | null | undefined,
  kind: ManeuverStopKind | null = null
): {update: () => void} {
  const accepted = (f: StopFlight | null | undefined) => {
    const node = f?.maneuver;
    return f && node && (kind ? node[kind] : !node.capture && !node.returnPlan && !node.departure)
      ? {f, node}
      : null;
  };
  const label = document.createElement('label'),
    input = document.createElement('input'),
    estimate = document.createElement('small');
  input.type = 'checkbox';
  input.setAttribute('aria-label', '目標Δvで噴射停止');
  label.append(
    input,
    document.createTextNode(kind ? '目標Δvで噴射停止（点火・推力調整は手動）' : '目標Δvで噴射停止')
  );
  label.title = '点火・推力調整は手動';
  panel.append(label, estimate);
  const precision = document.createElement('select');
  precision.setAttribute('aria-label', 'マニューバ到達精度');
  precision.title = '残りΔvの許容誤差。高精度では終盤の推力を下げてください';
  for (const [value, name] of [
    ['0.5', '通常 · 0.5 m/s'],
    ['0.05', '精密 · 0.05 m/s']
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = name;
    precision.append(option);
  }
  if (!kind) panel.append(precision);
  precision.onchange = () => {
    const a = accepted(getFlight());
    if (a && !a.node.rendezvous && !a.node.complete && canControl(a.f))
      a.node.tolerance = Number(precision.value);
    update();
  };
  input.onchange = () => {
    const a = accepted(getFlight());
    if (a && !a.node.complete && canControl(a.f)) a.node.stopAtTarget = input.checked;
    update();
  };
  function update() {
    const a = accepted(getFlight()),
      node = a ? a.node : null;
    input.checked = node?.stopAtTarget === true;
    input.disabled = !a || a.node.complete || !canControl(a.f);
    precision.disabled = input.disabled || !!node?.rendezvous;
    precision.value = String(node?.tolerance ?? 0.5);
    const seconds = a ? remainingBurnSeconds(a.f) : null;
    estimate.textContent = !a
      ? '計画固定後に停止支援を選べます。'
      : a.node.complete
        ? a.f.throttle > 0
          ? '目標到達 · 推力が残っています'
          : '目標到達 · 推力0'
        : seconds !== null
          ? `現在の推力なら残り約 ${seconds.toFixed(1)} 秒（整列時の目安）。`
          : '点火・開始時刻・方向を確認してください。停止支援は点火しません。';
  }
  return {update};
}

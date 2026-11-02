import * as T from 'three';
export interface PortGuide {
  horizontal: number;
  vertical: number;
  horizontalSpeed: number;
  verticalSpeed: number;
}
export interface ScopePoint {
  x: number;
  y: number;
}
export function portScope(g: PortGuide): {scale: number; current: ScopePoint; future: ScopePoint} {
  const scale =
    0.5 *
    2 **
      Math.max(
        0,
        Math.ceil(Math.log2(Math.max(0.5, Math.abs(g.horizontal) * 1.25, Math.abs(g.vertical) * 1.25) / 0.5))
      );
  const project = (x: number, y: number): ScopePoint => ({
    x: 110 + T.MathUtils.clamp((x / scale) * 60, -90, 90),
    y: 80 - T.MathUtils.clamp((y / scale) * 60, -60, 60)
  });
  return {
    scale,
    current: project(g.horizontal, g.vertical),
    future: project(g.horizontal + g.horizontalSpeed * 5, g.vertical + g.verticalSpeed * 5)
  };
}
export function drawPortScope(canvas: HTMLCanvasElement, g: PortGuide): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('2D描画を初期化できません');
  const {scale, current, future} = portScope(g);
  canvas.title =
    '橙：自機ポートのずれ。水色矢印：現在の横速度で5秒進んだ位置（重力・噴射は含まない）。J/L・U/Oで矢印を短くしてから中央へ';
  ctx.fillStyle = '#14232a';
  ctx.fillRect(0, 0, 220, 160);
  ctx.strokeStyle = '#64818b';
  ctx.beginPath();
  ctx.moveTo(15, 80);
  ctx.lineTo(205, 80);
  ctx.moveTo(110, 15);
  ctx.lineTo(110, 145);
  ctx.stroke();
  ctx.strokeStyle = '#79d1c2';
  ctx.beginPath();
  ctx.arc(110, 80, Math.max(2, (0.15 / scale) * 60), 0, Math.PI * 2);
  ctx.stroke();
  const angle = Math.atan2(future.y - current.y, future.x - current.x),
    length = Math.hypot(future.x - current.x, future.y - current.y);
  ctx.strokeStyle = '#72dfff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(current.x, current.y);
  ctx.lineTo(future.x, future.y);
  if (length > 4) {
    for (const side of [-1, 1]) {
      ctx.moveTo(future.x, future.y);
      ctx.lineTo(future.x - 6 * Math.cos(angle + side * 0.5), future.y - 6 * Math.sin(angle + side * 0.5));
    }
  }
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = '#ffb365';
  ctx.beginPath();
  ctx.arc(current.x, current.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#cbdadf';
  ctx.font = '11px sans-serif';
  ctx.fillText('目標面基準', 8, 12);
  ctx.fillText('±' + scale.toFixed(1) + ' m', 8, 154);
  ctx.fillStyle = '#72dfff';
  ctx.fillText('→ 5 s', 175, 154);
}

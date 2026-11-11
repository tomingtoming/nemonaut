// Render quality per device. Touch devices (phones, tablets) get a lower pixel-ratio cap,
// smaller shadow maps and the cheaper PCF shadow filter; the desktop gets exactly the earlier settings.
// Pure (no three.js): the renderers map shadowType to the three.js constant. Chosen once when a renderer
// is created (a WebGL context's antialias cannot change later).
export type RendererRole = 'main' | 'center';
export type RenderQuality = {
  pixelRatio: number;
  shadowMapSize: number;
  shadowType: 'pcf-soft' | 'pcf';
  antialias: boolean;
  /** Lose the context of a renderer that is no longer used (the thumbnail renderer) instead of keeping it. */
  releaseUnusedContexts: boolean;
};
/** Highest pixel ratio on touch devices, by renderer: the flight/workshop view and the space centre. */
export const TOUCH_PIXEL_RATIO_CAP: Record<RendererRole, number> = {main: 1.5, center: 1.25};
export const DESKTOP_PIXEL_RATIO_CAP = 2;

export function renderQuality(isTouch: boolean, dpr: number, role: RendererRole = 'main'): RenderQuality {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  if (!isTouch)
    return {
      pixelRatio: Math.min(ratio, DESKTOP_PIXEL_RATIO_CAP),
      shadowMapSize: 2048,
      shadowType: 'pcf-soft',
      antialias: true,
      releaseUnusedContexts: false
    };
  // Antialias stays on: phone GPUs are tile based and resolve MSAA on chip, so it costs little next to
  // the pixel count, and without it the lowered pixel ratio shows stair-stepped part edges.
  return {
    pixelRatio: Math.min(ratio, TOUCH_PIXEL_RATIO_CAP[role]),
    shadowMapSize: 1024,
    shadowType: 'pcf',
    antialias: true,
    releaseUnusedContexts: true
  };
}

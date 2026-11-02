// Docking tolerances (moved from docking.ts unchanged so that vessel-collision does not import docking, which
// imports core: that closed the runtime cycle core -> world-physics -> vessel-collision -> docking -> core).
// No imports and no import-time side effects; docking.ts re-exports it.
export const DOCK_LIMITS = {distance: 0.15, angle: (8 * Math.PI) / 180, speed: 0.3, angularSpeed: 0.15};

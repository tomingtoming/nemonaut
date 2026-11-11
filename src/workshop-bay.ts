// Workshop bay geometry (BACKLOG 7c, moved from app.ts): the hangar room, the deck, the floor and the grid,
// and their fitting to the craft. No import-time side effects: app.ts calls buildWorkshopBay() where the
// geometry was built before.
import * as T from 'three';
import {workshopLayout, workshopFrame} from './workshop-layout.js';
import {state} from './app-state.js';
import {sceneCore, mat, box, setWorkshopFog} from './scene.js';
let built: {
  room: T.Group;
  workshopDeck: T.Group;
  workshopGround: ReturnType<typeof box>;
  grid: T.GridHelper;
} | null = null;
export function buildWorkshopBay() {
  const {bay} = sceneCore();
  const room = new T.Group(),
    workshopDeck = new T.Group();
  bay.add(room, workshopDeck);
  // One material for each kind of repeated piece.
  const beamMat = mat('#25343d', 0.5, 0.5),
    stripeMat = mat('#b07b43'),
    mullionMat = mat('#3a505b'),
    lampMat = new T.MeshStandardMaterial({color: '#d5f1fa', emissive: '#9dd9ef', emissiveIntensity: 2}),
    tickMat = mat('#73878b');
  const workshopGround = box(bay, [90, 0.25, 90], [0, -0.3, 0], mat('#334750', 0.3, 0.65));
  workshopGround.renderOrder = -2;
  let grid = asUnderlay(new T.GridHelper(80, 80, '#647984', '#435963'));
  bay.add(grid);
  for (const x of [-18, 18]) {
    box(room, [0.5, 22, 44], [x, 10, -3], beamMat);
    for (let z = -22; z <= 20; z += 7) {
      box(room, [0.65, 20, 0.65], [x, 10, z], beamMat);
      box(room, [0.1, 8, 0.25], [x - x / 180, 8, z], stripeMat);
    }
  }
  for (let z = -22; z <= 20; z += 7) box(room, [36, 0.45, 0.5], [0, 19, z], beamMat);
  box(room, [36, 19, 0.5], [0, 9.5, -25], mat('#243742'));
  for (const x of [-12, -6, 0, 6, 12]) {
    box(room, [0.1, 18, 0.1], [x, 9, -24.6], mullionMat);
    box(room, [2.7, 0.07, 0.1], [x, 13, -24.4], lampMat);
  }
  const platform = new T.Mesh(new T.CylinderGeometry(4.7, 4.9, 0.12, 80), mat('#263940', 0.5, 0.55));
  platform.position.y = -0.09;
  platform.receiveShadow = true;
  workshopDeck.add(platform);
  const ring = new T.Mesh(new T.TorusGeometry(4.65, 0.025, 6, 100), mat('#e0ab62'));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.02;
  workshopDeck.add(ring);
  for (let i = 0; i < 32; i++) {
    const t = (i * Math.PI) / 16;
    const m = box(
      workshopDeck,
      [0.08, 0.015, 0.3],
      [4.35 * Math.cos(t), -0.015, 4.35 * Math.sin(t)],
      tickMat
    );
    m.rotation.y = -t + Math.PI / 2;
  }
  built = {room, workshopDeck, workshopGround, grid};
}
/**
 * The floor grid is drawn as an underlay: after the ground and before everything else, without writing
 * depth, so the platform and the craft always cover it. On some phone GPUs the grid lines showed through
 * the craft, although the ground, platform and craft occlude each other
 * correctly; drawing order does not depend on the lines' depth.
 */
function asUnderlay(grid: T.GridHelper): T.GridHelper {
  grid.position.y = -0.16;
  grid.renderOrder = -1;
  for (const material of Array.isArray(grid.material) ? grid.material : [grid.material])
    material.depthWrite = false;
  return grid;
}
function workshopBay() {
  if (!built) throw Error('作業場がまだ作られていません');
  return built;
}
export function updateWorkshop() {
  const {bay, camera, controls, craftRoot} = sceneCore(),
    bayParts = workshopBay(),
    {room, workshopDeck, workshopGround} = bayParts;
  if (state.flight) return;
  const bounds = new T.Box3().setFromObject(craftRoot),
    layout = workshopLayout(bounds, camera.fov, camera.aspect);
  bay.position.fromArray(layout.origin);
  state.workshopFloor = layout.origin[1];
  room.scale.fromArray(layout.roomScale);
  workshopDeck.scale.set(layout.platformScale, 1, layout.platformScale);
  workshopGround.scale.set((layout.gridSize + 10) / 90, 1, (layout.gridSize + 10) / 90);
  if (state.workshopGridSize !== layout.gridSize) {
    bayParts.grid.removeFromParent();
    bayParts.grid.geometry.dispose();
    for (const material of Array.isArray(bayParts.grid.material)
      ? bayParts.grid.material
      : [bayParts.grid.material])
      material.dispose();
    state.workshopGridSize = layout.gridSize;
    const step = Math.max(1, Math.ceil(state.workshopGridSize / 200));
    bayParts.grid = asUnderlay(
      new T.GridHelper(state.workshopGridSize, Math.ceil(state.workshopGridSize / step), '#647984', '#435963')
    );
    bay.add(bayParts.grid);
  }
  const fit = workshopFrame(bounds, camera.fov, camera.aspect);
  if (fit) {
    controls.maxDistance = fit.maxDistance;
    setWorkshopFog(fit.fogNear, fit.fogFar);
  }
}

import {overWater} from './surface-frame.js';
// 3D scene core (BACKLOG 7c, moved from app.ts): renderer, scene, camera, orbit controls, lights, the
// top-level groups, the editor markers and overlays, the registry of part objects and the camera framing.
// No import-time scene creation: app.ts calls the create* functions at the places where these objects were
// created before, so the creation order (and the order of the scene's children) is unchanged.
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {flightFrameOffset, setOrbitUp} from './camera-up.js';
import {bodyAltitude, bodyUp} from './celestial.js';
import {workshopFrame} from './workshop-layout.js';
import {state} from './app-state.js';
import {flightCenter} from './current-flight.js';
import {renderQuality, type RenderQuality} from './render-quality.js';
import {isTouchDevice} from './touch-device.js';
export type SceneCore = {
  canvas: HTMLCanvasElement;
  viewport: HTMLElement;
  renderer: T.WebGLRenderer;
  scene: T.Scene;
  camera: T.PerspectiveCamera;
  controls: OrbitControls;
  ambient: T.HemisphereLight;
  sun: T.DirectionalLight;
  bay: T.Group;
  testWorld: T.Group;
  craftRoot: T.Group;
  markers: T.Group;
};
export type EditorMarkers = {
  aeroMarker: T.Mesh<T.SphereGeometry, T.MeshBasicMaterial>;
  comMarker: T.Mesh<T.SphereGeometry, T.MeshBasicMaterial>;
  gizmo: TransformControls;
};
export type SelectionOverlays = {highlight: T.BoxHelper; placementCopies: T.Group; partHover: T.BoxHelper};
/** Part id → its object under craftRoot (filled by rebuild and by the flight). */
export const objects = new Map<string, T.Object3D>();
/** The point the camera follows in flight. */
export const flightFocus = new T.Vector3();
let base: {
    canvas: HTMLCanvasElement;
    renderer: T.WebGLRenderer;
    scene: T.Scene;
    quality: RenderQuality;
  } | null = null,
  core: SceneCore | null = null,
  editor: EditorMarkers | null = null,
  selection: SelectionOverlays | null = null;
/** Renderer and scene (first part of the set-up; app.ts then creates the failure visuals). */
export function createRenderer(canvas: HTMLCanvasElement) {
  const quality = renderQuality(isTouchDevice(), devicePixelRatio);
  const renderer = new T.WebGLRenderer({canvas, antialias: quality.antialias, logarithmicDepthBuffer: true});
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = shadowMapType(quality);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new T.Scene();
  scene.background = new T.Color('#293c49');
  scene.fog = new T.Fog('#293c49', 55, 135);
  base = {canvas, renderer, scene, quality};
  return base;
}
/** three.js shadow filter for a render quality. */
const shadowMapType = (quality: RenderQuality): T.ShadowMapType =>
  quality.shadowType === 'pcf' ? T.PCFShadowMap : T.PCFSoftShadowMap;
/** Quality chosen for the main renderer (the thumbnail renderer follows it). */
export function mainRenderQuality(): RenderQuality {
  if (!base) throw Error('描画器がまだ作られていません');
  return base.quality;
}
/** Camera, controls, environment, lights and the top-level groups. */
export function createView(viewport: HTMLElement): SceneCore {
  if (!base) throw Error('描画器がまだ作られていません');
  const {canvas, renderer, scene, quality} = base;
  const camera = new T.PerspectiveCamera(40, 1, 0.05, 50000000);
  camera.position.set(10, 7, 12);
  camera.layers.enable(1);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 2, 0);
  controls.enableDamping = true;
  controls.minDistance = 2;
  controls.maxDistance = 80;
  controls.mouseButtons = {LEFT: null, MIDDLE: T.MOUSE.PAN, RIGHT: T.MOUSE.ROTATE};
  const pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const ambient = new T.HemisphereLight('#c7e8ff', '#414346', 0.9);
  scene.add(ambient);
  const sun = new T.DirectionalLight('#fff0d8', 2.4);
  sun.position.set(12, 24, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  Object.assign(sun.shadow.camera, {left: -18, right: 18, top: 18, bottom: -18, near: 0.1, far: 100});
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
  const bay = new T.Group(),
    testWorld = new T.Group(),
    craftRoot = new T.Group(),
    markers = new T.Group();
  scene.add(bay, testWorld, craftRoot, markers);
  testWorld.visible = false;
  core = {
    canvas,
    viewport,
    renderer,
    scene,
    camera,
    controls,
    ambient,
    sun,
    bay,
    testWorld,
    craftRoot,
    markers
  };
  return core;
}
export function sceneCore(): SceneCore {
  if (!core) throw Error('3D表示がまだ作られていません');
  return core;
}
/** Aerodynamic-centre and centre-of-mass markers and the transform gizmo. */
export function createEditorMarkers(): EditorMarkers {
  const {scene, camera, canvas} = sceneCore();
  const aeroMarker = new T.Mesh(
    new T.SphereGeometry(0.13, 16, 12),
    new T.MeshBasicMaterial({color: '#55dce8', depthTest: false})
  );
  aeroMarker.renderOrder = 10;
  aeroMarker.visible = false;
  scene.add(aeroMarker);
  const comMarker = new T.Mesh(
    new T.SphereGeometry(0.13, 16, 12),
    new T.MeshBasicMaterial({color: '#e7cf4c', depthTest: false})
  );
  comMarker.renderOrder = 10;
  comMarker.visible = false;
  scene.add(comMarker);
  const gizmo = new TransformControls(camera, canvas);
  scene.add(gizmo.getHelper());
  gizmo.setSize(0.8);
  gizmo.setSpace('local');
  editor = {aeroMarker, comMarker, gizmo};
  return editor;
}
export function editorMarkers(): EditorMarkers {
  if (!editor) throw Error('編集用の表示がまだ作られていません');
  return editor;
}
/** Selection box, symmetry placement copies and the hover box. */
export function createSelectionOverlays(): SelectionOverlays {
  const {scene, craftRoot} = sceneCore();
  const highlight = new T.BoxHelper(new T.Object3D(), '#eeae6d');
  highlight.visible = false;
  scene.add(highlight);
  const placementCopies = new T.Group();
  scene.add(placementCopies);
  const partHover = new T.BoxHelper(craftRoot, 0xa3e86c);
  partHover.visible = false;
  scene.add(partHover);
  selection = {highlight, placementCopies, partHover};
  return selection;
}
export function selectionOverlays(): SelectionOverlays {
  if (!selection) throw Error('選択表示がまだ作られていません');
  return selection;
}
export const mat = (c: T.ColorRepresentation, metal = 0.1, rough = 0.7) =>
  new T.MeshStandardMaterial({color: c, metalness: metal, roughness: rough});
export function box(parent: T.Object3D, size: T.Vector3Tuple, pos: T.Vector3Tuple, material: T.Material) {
  const m = new T.Mesh(new T.BoxGeometry(...size), material);
  m.position.set(...pos);
  m.receiveShadow = true;
  m.castShadow = true;
  parent.add(m);
  return m;
}
export function partObject(id: string): T.Object3D {
  const o = objects.get(id);
  if (!o) throw Error('部品の表示が見つかりません: ' + id);
  return o;
}
export function setCameraUp(up: T.Vector3) {
  const {controls} = sceneCore();
  setOrbitUp(controls, up);
}
const workshopFogColor = new T.Color('#293c49');
/** The workshop's fog from `near` to `far`: the scene's fog is moved when it is already the workshop's. */
export function setWorkshopFog(near: number, far: number) {
  const {scene} = sceneCore(),
    fog = scene.fog;
  if (fog instanceof T.Fog && fog.color.equals(workshopFogColor)) {
    fog.near = near;
    fog.far = far;
  } else scene.fog = new T.Fog(workshopFogColor, near, far);
}
export function resize() {
  const {viewport, renderer, camera} = sceneCore();
  const w = viewport.clientWidth,
    h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
export function frame() {
  const {camera, controls, craftRoot} = sceneCore();
  setCameraUp(state.flight ? bodyUp(flightCenter(), state.flight.universalTime) : new T.Vector3(0, 1, 0));
  const bounds = new T.Box3();
  if (state.flight) {
    craftRoot.updateWorldMatrix(true, true);
    for (const p of state.flight.parts) {
      const object = objects.get(p.id);
      if (object) bounds.expandByObject(object);
    }
  } else bounds.setFromObject(craftRoot);
  if (bounds.isEmpty()) return;
  const fit = workshopFrame(bounds, camera.fov, camera.aspect);
  if (!fit) return;
  if (!state.flight) {
    controls.maxDistance = fit.maxDistance;
    setWorkshopFog(fit.fogNear, fit.fogFar);
    controls.target.copy(fit.target);
    camera.position
      .copy(fit.target)
      .add(new T.Vector3(1, 0.65, 1.3).normalize().multiplyScalar(fit.distance));
    controls.update();
    return;
  }
  flightFocus.copy(flightCenter());
  const water =
    overWater(flightFocus, state.flight.universalTime) &&
    bodyAltitude(flightFocus, state.flight.universalTime) <= fit.distance;
  controls.target.copy(fit.target);
  camera.position
    .copy(fit.target)
    .add(
      flightFrameOffset(
        fit.distance * (water ? 1 : 1.5),
        bodyUp(flightCenter(), state.flight.universalTime),
        water
      )
    );
  controls.update();
}

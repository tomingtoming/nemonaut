// Part and scenery models (BACKLOG 7c, moved from app.ts): the loaded GLB scenes by part type, their bounds,
// and the start-up loading with the catalogue thumbnails. No import-time side effects: boot() in app.ts calls
// loadAssets() at the place where the models were loaded before.
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PARTS} from './catalog.js';
import {mainRenderQuality, sceneCore} from './scene.js';
/** Part type (or scenery name) → its loaded model; clone it, never add it to a scene directly. */
export const assets = new Map<string, T.Object3D>();
/** Part type → bounds of its model. */
export const assetBounds = new Map<string, T.Box3>();
export function assetModel(type: string): T.Object3D {
  const model = assets.get(type);
  if (!model) throw Error('部品モデルが見つかりません: ' + type);
  return model;
}
/** Loads every part and scenery model and renders the catalogue thumbnails. */
export async function loadAssets() {
  const {scene} = sceneCore();
  const loader = new GLTFLoader();
  await Promise.all(
    Object.keys(PARTS).map(async type => {
      const gltf = await loader.loadAsync(`./assets/parts/${PARTS[type].model || type}.glb`);
      const model = gltf.scene,
        offset = PARTS[type].modelCenter;
      const assemblyModel = offset ? new T.Group().add(model) : model;
      if (offset) model.position.fromArray(offset);
      assets.set(type, assemblyModel);
      assetBounds.set(type, new T.Box3().setFromObject(assemblyModel));
    })
  );
  const thumbRenderer = new T.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true});
  thumbRenderer.setSize(180, 120);
  thumbRenderer.setPixelRatio(1);
  thumbRenderer.toneMapping = T.ACESFilmicToneMapping;
  thumbRenderer.toneMappingExposure = 1.05;
  const ts = new T.Scene();
  ts.environment = scene.environment;
  ts.add(new T.HemisphereLight('#ffffff', '#6e8998', 1.2));
  const light = new T.DirectionalLight('#fff4db', 2.5);
  light.position.set(4, 6, 5);
  ts.add(light);
  const tc = new T.PerspectiveCamera(33, 1.5, 0.01, 100);
  for (const [type, model] of assets) {
    const clone = model.clone(true);
    ts.add(clone);
    const b = new T.Box3().setFromObject(clone),
      center = b.getCenter(new T.Vector3()),
      s = b.getSize(new T.Vector3()).length();
    tc.position.copy(center).add(new T.Vector3(1.3, 0.8, 1.8).normalize().multiplyScalar(s * 1.8));
    tc.lookAt(center);
    thumbRenderer.render(ts, tc);
    model.userData.thumbnail = thumbRenderer.domElement.toDataURL();
    ts.remove(clone);
  }
  thumbRenderer.dispose();
  // Touch (8g): give the thumbnail context back to the browser (phones allow only a few at a time); the
  // thumbnails are data URLs by now and this renderer is never used again.
  if (mainRenderQuality().releaseUnusedContexts) thumbRenderer.forceContextLoss();
  const shroud = await loader.loadAsync('./assets/parts/engine-shroud.glb');
  assets.set('engine-shroud', shroud.scene);
  const canopy = await loader.loadAsync('./assets/parts/parachute-open.glb');
  canopy.scene.traverse((o: T.Object3D) => {
    if (o instanceof T.Mesh && !Array.isArray(o.material)) o.material.side = T.DoubleSide;
  });
  assets.set('parachute-open', canopy.scene);
  await Promise.all(
    ['north', 'east'].map(async id => {
      const marker = await loader.loadAsync('./assets/scenery/survey-' + id + '.glb');
      assets.set('survey-' + id, marker.scene);
    })
  );
  const pad = await loader.loadAsync('./assets/scenery/launchpad.glb');
  assets.set('launchpad', pad.scene);
}

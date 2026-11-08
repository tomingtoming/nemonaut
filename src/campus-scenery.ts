import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PLANET} from './planet.js';

let campus: Promise<T.Group> | undefined;
export function loadCampus(): Promise<T.Group> {
  return (campus ??= new GLTFLoader()
    .loadAsync('./assets/scenery/space-center.glb')
    .then(gltf => gltf.scene)
    .catch(error => {
      campus = undefined;
      throw error;
    }));
}

// Position of the exported pad origin in the Blender campus (Three.js axes).
export const campusPadOrigin = new T.Vector3(107, 1.05, -66);
export function addPadBuildings(parent: T.Group, source: T.Group) {
  const buildings = new T.Group();
  buildings.position.set(0, PLANET.radius, 0).sub(campusPadOrigin);
  source.traverse(root => {
    if (root.userData.facility !== 'vab' && root.userData.facility !== 'tracking') return;
    const copy = root.clone(true);
    copy.traverse(o => {
      if (o instanceof T.Mesh) {
        o.userData.sharedAsset = true;
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    buildings.add(copy);
  });
  parent.add(buildings);
}

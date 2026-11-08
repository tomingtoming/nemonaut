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
function copyBuildings(group: T.Group, source: T.Group, ids: readonly string[]) {
  source.traverse(root => {
    if (!ids.includes(root.userData.facility)) return;
    const copy = root.clone(true);
    copy.traverse(o => {
      if (o instanceof T.Mesh) {
        o.userData.sharedAsset = true;
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    group.add(copy);
  });
}
export function addPadBuildings(parent: T.Group, source: T.Group) {
  const buildings = new T.Group();
  buildings.position.set(0, PLANET.radius, 0).sub(campusPadOrigin);
  copyBuildings(buildings, source, ['vab', 'tracking']);
  parent.add(buildings);
}
export function addRunwayHangar(runwaySite: T.Group, source: T.Group) {
  // Align the model taxiway junction (60, 1, 145) with the departure point.
  // Campus 09 to 27 is +X, and the flight runway runs along local +Z.
  const hangar = new T.Group();
  hangar.rotation.y = -Math.PI / 2;
  hangar.position.set(145, -1, -60);
  copyBuildings(hangar, source, ['sph']);
  runwaySite.add(hangar);
}

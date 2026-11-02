// The flight world (BACKLOG 7c, moved from app.ts): planet globe, Moon, the surface patch under the vessel,
// the launch pad, runway and survey markers under testWorld, and their per-frame placement. No import-time
// side effects.
import * as T from 'three';
import {PLANET, center} from './planet.js';
import {MOON, bodyState, bodyUp, bodyOrbitState} from './celestial.js';
import {FlightScenery, surfaceMaterial} from './flight-scenery.js';
import {addLaunchpad} from './launchpad-scenery.js';
import {addSurveyMarkers} from './survey-markers.js';
import {RUNWAY} from './runway-navigation.js';
import {launchSiteOrientation, surfaceOrientation} from './surface-frame.js';
import {disposeWreckVisual} from './failure-visuals.js';
import {state} from './app-state.js';
import {currentFlight, flightCenter} from './current-flight.js';
import {sceneCore, mat, box} from './scene.js';
import {assets} from './asset-loader.js';
type MeshLike = T.Object3D & {geometry?: T.BufferGeometry; material?: T.Material | T.Material[]};
let surfacePatch: T.Mesh;
let moonGlobe: T.Mesh, groundFacilities: T.Group;
/** Materials of the planet globe and the surface patch (read each frame by the flight scenery). */
export let planetMaterial: ReturnType<typeof surfaceMaterial>,
  patchMaterial: ReturnType<typeof surfaceMaterial>;
export function disposeWorld() {
  const {testWorld} = sceneCore();
  disposeWreckVisual(testWorld);
  testWorld.traverse((o: MeshLike) => {
    if (o.userData.sharedAsset) return;
    o.geometry?.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => m.dispose());
    }
  });
  testWorld.clear();
}
export function buildTestWorld(environment: string, time: number) {
  const {testWorld} = sceneCore();
  disposeWorld();
  groundFacilities = new T.Group();
  testWorld.add(groundFacilities);
  const color = environment === 'water' ? '#164c64' : '#627569';
  planetMaterial = surfaceMaterial(environment === 'water');
  const globe = new T.Mesh(new T.SphereGeometry(PLANET.radius, 256, 128), planetMaterial);
  globe.layers.set(1);
  globe.position.copy(center);
  testWorld.add(globe);
  moonGlobe = new T.Mesh(new T.SphereGeometry(MOON.radius, 192, 96), mat('#92918d', 0, 1));
  moonGlobe.layers.set(1);
  moonGlobe.position.copy(bodyState(MOON, time).position);
  testWorld.add(moonGlobe);
  const geometry = new T.PlaneGeometry(4000, 4000, 64, 64);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      z = positions.getZ(i);
    positions.setY(i, Math.sqrt(PLANET.radius ** 2 - x * x - z * z) - PLANET.radius + 0.01);
  }
  geometry.computeVertexNormals();
  patchMaterial = surfaceMaterial(environment === 'water');
  surfacePatch = new T.Mesh(geometry, patchMaterial);
  state.flightScenery = new FlightScenery(testWorld);
  surfacePatch.receiveShadow = true;
  testWorld.add(surfacePatch);
  if (environment !== 'water') {
    addLaunchpad(groundFacilities, assets.get('launchpad'));
    addSurveyMarkers(groundFacilities, assets);
    const runwaySite = new T.Group();
    runwaySite.quaternion.copy(launchSiteOrientation('runway'));
    runwaySite.position.set(0, PLANET.radius, 0).applyQuaternion(runwaySite.quaternion);
    groundFacilities.add(runwaySite);
    const runwayGeometry = new T.PlaneGeometry(RUNWAY.width, RUNWAY.length, 1, 80);
    runwayGeometry.rotateX(-Math.PI / 2);
    runwayGeometry.translate(0, 0, RUNWAY.center);
    const rp = runwayGeometry.attributes.position;
    for (let i = 0; i < rp.count; i++)
      rp.setY(i, 0.025 - (rp.getX(i) ** 2 + rp.getZ(i) ** 2) / (2 * PLANET.radius));
    runwayGeometry.computeVertexNormals();
    const runway = new T.Mesh(runwayGeometry, mat('#3a4245'));
    runway.receiveShadow = true;
    runwaySite.add(runway);
    for (let z = -40; z < 1400; z += 22)
      box(runwaySite, [0.25, 0.01, 8], [0, 0.035 - (z * z) / (2 * PLANET.radius), z], mat('#d8d7bd'));
  }
}
export function updateWorldGeometry() {
  const fl = currentFlight(),
    o = fl.orbit || bodyOrbitState(flightCenter(), fl.vel, fl.universalTime);
  moonGlobe.position.copy(bodyState(MOON, fl.universalTime).position);
  groundFacilities.quaternion.copy(surfaceOrientation(fl.universalTime));
  groundFacilities.position.copy(center);
  const up = bodyUp(fl.pos, fl.universalTime);
  surfacePatch.visible = o.bodyId === 'planet';
  surfacePatch.position.copy(up).multiplyScalar(o.body.radius).add(o.center);
  surfacePatch.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), up);
}

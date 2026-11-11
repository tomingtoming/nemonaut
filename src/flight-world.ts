// The flight world (BACKLOG 7c, moved from app.ts): planet globe, Moon, the surface patch under the vessel,
// the launch pad, runway and survey markers under testWorld, and their per-frame placement. No import-time
// side effects.
import * as T from 'three';
import {PLANET, center} from './planet.js';
import {MOON, bodyState, bodyUp, bodyOrbitState} from './celestial.js';
import {FlightScenery, surfaceMaterial} from './flight-scenery.js';
import {loadCampus, addPadBuildings, addRunwayHangar} from './campus-scenery.js';
import {addLaunchpad} from './launchpad-scenery.js';
import {addSurveyMarkers} from './survey-markers.js';
import {addRunwayMarkings} from './runway-scenery.js';
import {RUNWAY} from './runway-navigation.js';
import {launchSiteOrientation, surfaceOrientation} from './surface-frame.js';
import {state} from './app-state.js';
import {currentFlight, flightCenter} from './current-flight.js';
import {sceneCore, mat} from './scene.js';
import {assets} from './asset-loader.js';
import {disposeVisuals} from './part-visuals.js';
let surfacePatch: T.Mesh;
let moonGlobe: T.Mesh, groundFacilities: T.Group, runwaySite: T.Group;
let campus: 'missing' | 'loading' | 'added' = 'missing';
/** Materials of the planet globe and the surface patch (read each frame by the flight scenery). */
export let planetMaterial: ReturnType<typeof surfaceMaterial>,
  patchMaterial: ReturnType<typeof surfaceMaterial>;
/** The world's own children of testWorld, once built; a flight adds its canopies and debris after them. */
let worldObjects: Set<T.Object3D> | null = null;
/** Adds the campus buildings once their model has loaded; a failed load is tried again at the next flight. */
function addCampus() {
  if (campus !== 'missing') return;
  campus = 'loading';
  const {testWorld} = sceneCore(),
    site = groundFacilities,
    runway = runwaySite;
  void loadCampus()
    .then(model => {
      if (site !== groundFacilities || site.parent !== testWorld) return;
      addPadBuildings(site, model);
      addRunwayHangar(runway, model);
      campus = 'added';
    })
    .catch(error => {
      if (site === groundFacilities) campus = 'missing';
      console.warn('宇宙センターの建物を表示できません', error);
    });
}
/**
 * Prepares testWorld for a flight starting at `time`. The globes, the surface patch, the sky and the ground
 * facilities depend on nothing but the time, which updateWorldGeometry and the scenery follow each frame, so
 * they are built once; what the previous flight left under testWorld is disposed either way.
 */
export function buildTestWorld(time: number) {
  const {testWorld} = sceneCore();
  if (worldObjects) {
    for (const o of [...testWorld.children])
      if (!worldObjects.has(o)) {
        disposeVisuals(o);
        testWorld.remove(o);
      }
    moonGlobe.position.copy(bodyState(MOON, time).position);
    addCampus();
    return;
  }
  disposeVisuals(testWorld);
  testWorld.clear();
  groundFacilities = new T.Group();
  testWorld.add(groundFacilities);
  planetMaterial = surfaceMaterial();
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
  patchMaterial = surfaceMaterial();
  surfacePatch = new T.Mesh(geometry, patchMaterial);
  state.flightScenery = new FlightScenery(testWorld);
  surfacePatch.receiveShadow = true;
  testWorld.add(surfacePatch);
  addLaunchpad(groundFacilities, assets.get('launchpad'));
  addSurveyMarkers(groundFacilities, assets);
  runwaySite = new T.Group();
  runwaySite.quaternion.copy(launchSiteOrientation('runway'));
  runwaySite.position.set(0, PLANET.radius, 0).applyQuaternion(runwaySite.quaternion);
  groundFacilities.add(runwaySite);
  campus = 'missing';
  addCampus();
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
  addRunwayMarkings(runwaySite);
  worldObjects = new Set(testWorld.children);
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

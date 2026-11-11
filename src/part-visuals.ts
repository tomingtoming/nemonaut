// Part visuals (BACKLOG 7c, moved from app.ts): a part's 3D object (model, hinge, gimbal, wheel, RCS plumes,
// cargo) and the rebuild of the craft's objects under craftRoot. No import-time side effects.
import * as T from 'three';
import {makeSurfaceHinge} from './surface-hinge.js';
import {PARTS} from './catalog.js';
import type {FlightPart, Flight} from './core.js';
import {RCS_DIRECTIONS, rcsOutlet} from './rcs.js';
import {syncCargoVisual} from './cargo-geometry.js';
import {disposeWreckVisual} from './failure-visuals.js';
import {state} from './app-state.js';
import {sceneCore, editorMarkers, objects, partObject} from './scene.js';
import {assetModel} from './asset-loader.js';
import {engineMaxThrust} from './resources.js';
import {screwRotor, screwSpinStep, screwSpinTarget} from './screw-spin.js';
import {
  gearFold,
  gearFoldPivot,
  gearStrutScale,
  gearStrutTop,
  gearTravel,
  isRetractable
} from './landing-gear.js';
type MeshLike = T.Object3D & {geometry?: T.BufferGeometry; material?: T.Material | T.Material[]};
// RCS plumes share one cone and fade through a material each. The materials of removed visuals are used
// again, not disposed: the renderer drops a shader program with its last material and would compile it
// again at the next jet.
let rcsPlumeGeometry: T.ConeGeometry | null = null;
const sparePlumeMaterials = new Set<T.MeshBasicMaterial>();
function plumeMaterial(): T.MeshBasicMaterial {
  for (const spare of sparePlumeMaterials) {
    sparePlumeMaterials.delete(spare);
    return spare;
  }
  return new T.MeshBasicMaterial({color: '#b7e9ff', transparent: true, opacity: 0.6, depthWrite: false});
}
/**
 * Frees what the visuals under `root`, which is leaving the scene, own: wreck tints, RCS plume materials,
 * and the geometry and materials of other meshes that are not clones of a loaded model (engine plumes).
 */
export function disposeVisuals(root: T.Object3D) {
  disposeWreckVisual(root);
  root.traverse((o: MeshLike) => {
    if (o.userData.sharedAsset) return;
    if (o.userData.rcsPlume) {
      if (o.material instanceof T.MeshBasicMaterial) sparePlumeMaterials.add(o.material);
      return;
    }
    o.geometry?.dispose();
    if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
  });
}
export function cloneModel(type: string) {
  const model = assetModel(type).clone(true);
  model.traverse(m => {
    if (m instanceof T.Mesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.sharedAsset = true;
    }
  });
  return model;
}
export function makePartVisual(p: FlightPart) {
  const o = new T.Group();
  o.userData.partId = p.id;
  const visual = cloneModel(p.type);
  if (PARTS[p.type].controlAxis || PARTS[p.type].flapAngles) {
    const hinge = makeSurfaceHinge(visual, PARTS[p.type]);
    o.add(hinge);
    o.userData.hinge = hinge;
  } else if (PARTS[p.type].gimbal) {
    o.add(visual);
    const nozzle = visual.getObjectByName('GimbalNozzle');
    if (nozzle) {
      const pivotAt = PARTS[p.type].gimbalPivot;
      if (!pivotAt) throw Error('ジンバルの支点がありません: ' + p.type);
      const pivot = new T.Group();
      pivot.position.fromArray(pivotAt);
      visual.add(pivot);
      nozzle.removeFromParent();
      nozzle.position.sub(pivot.position);
      pivot.add(nozzle);
      o.userData.gimbal = pivot;
    }
  } else if (PARTS[p.type].wheel) {
    const steering = new T.Group(),
      rolling = new T.Group();
    rolling.add(visual);
    steering.add(rolling);
    if (isRetractable(p.type)) {
      // Retractable gear (BACKLOG 9c) folds about a pivot: the top of the wheel, or the strut's top once
      // rebuildCraft has mounted a strut. The inner group carries the wheel and the strut back to place.
      const fold = new T.Group(),
        inner = new T.Group();
      fold.position.y = PARTS[p.type].size[1] / 2;
      inner.position.y = -fold.position.y;
      inner.add(steering);
      fold.add(inner);
      o.add(fold);
      o.userData.gearFold = fold;
      o.userData.gearInner = inner;
    } else o.add(steering);
    o.userData.steeringVisual = steering;
    o.userData.rollingVisual = rolling;
  } else o.add(visual);
  const {screwBlades, screwPivot} = PARTS[p.type];
  if (screwBlades && screwPivot) {
    const rotor = screwRotor(visual, screwBlades, screwPivot);
    if (rotor) o.userData.rotor = rotor;
  }
  if (PARTS[p.type].rcsThrust) {
    o.userData.rcsPlumes = RCS_DIRECTIONS.map(direction => {
      const plume = new T.Mesh((rcsPlumeGeometry ??= new T.ConeGeometry(0.07, 0.5, 12)), plumeMaterial());
      plume.userData.rcsPlume = true;
      const exhaust = new T.Vector3(...direction).negate();
      plume.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), exhaust.clone().negate());
      plume.position.copy(rcsOutlet(PARTS[p.type].size, direction)).addScaledVector(exhaust, 0.25);
      plume.visible = false;
      o.add(plume);
      return plume;
    });
  }
  syncCargoVisual(o, p, PARTS[p.type]);
  o.position.fromArray(p.p);
  o.rotation.set(...p.r);
  return o;
}
/**
 * Turns a screw's rotor at the rate of the thrust it gives in flight (throttle × submersion × active), on the
 * flight's own clock: a paused flight stands still, and a long frame does not jump the rotor ahead.
 */
export function updateScrewVisual(o: T.Object3D | undefined, f: Flight, p: FlightPart) {
  const rotor = o?.userData.rotor;
  if (!o || !(rotor instanceof T.Group)) return;
  const last = o.userData.rotorTime,
    dt = typeof last === 'number' ? Math.min(0.1, Math.max(0, f.universalTime - last)) : 0,
    speed = typeof o.userData.rotorSpeed === 'number' ? o.userData.rotorSpeed : 0,
    thrust = f.crashed ? 0 : f.engineThrust.get(p.id) || 0,
    next = screwSpinStep(speed, screwSpinTarget(thrust, engineMaxThrust(p), PARTS[p.type].size[0] / 2), dt);
  o.userData.rotorTime = f.universalTime;
  o.userData.rotorSpeed = next;
  rotor.rotation.y = (rotor.rotation.y + next * dt) % (2 * Math.PI);
}
/**
 * Folds a retractable gear visual toward the vessel's gear state over GEAR_TRAVEL_TIME on the flight's own
 * clock (a paused flight holds the pose); a visual seen for the first time takes the state at once.
 */
export function updateGearVisual(o: T.Object3D | undefined, f: Flight) {
  const fold = o?.userData.gearFold;
  if (!o || !(fold instanceof T.Group)) return;
  const last = o.userData.gearTime,
    position = o.userData.gearPosition,
    next =
      typeof last === 'number' && typeof position === 'number'
        ? gearTravel(position, f.gearDeployed, Math.min(0.1, Math.max(0, f.universalTime - last)))
        : f.gearDeployed
          ? 1
          : 0,
    pose = gearFold(next);
  o.userData.gearTime = f.universalTime;
  o.userData.gearPosition = next;
  fold.rotation.x = pose.angle;
  fold.scale.setScalar(pose.scale);
}
export function updateRCSVisual(o: T.Object3D | undefined, f: Flight) {
  if (!o?.userData.rcsPlumes) return;
  const jets = f.rcsJets.filter(j => j.id === o.userData.partId);
  o.userData.rcsPlumes.forEach((mesh: T.Mesh<T.ConeGeometry, T.MeshBasicMaterial>, index: number) => {
    const level = jets.find(j => j.index === index)?.level || 0;
    mesh.visible = level > 0.01 && !f.crashed;
    mesh.material.opacity = 0.25 + 0.4 * level;
  });
}
/** Rebuilds the objects of the workshop craft (state.parts) under craftRoot, with the wheel mounts. */
export function rebuildCraft() {
  const {craftRoot} = sceneCore(),
    {gizmo} = editorMarkers();
  gizmo.detach();
  disposeVisuals(craftRoot);
  craftRoot.clear();
  objects.clear();
  for (const p of state.parts) {
    const o = makePartVisual(p);
    craftRoot.add(o);
    objects.set(p.id, o);
  }
  for (const p of state.parts) {
    if (!PARTS[p.type].wheel) continue;
    const parent = state.parts.find(a => a.id === p.parent);
    if (!parent) continue;
    const wheel = partObject(p.id),
      from = new T.Vector3(...p.p),
      to = gearStrutTop(p, parent);
    if (to) {
      const delta = to.clone().sub(from),
        mount = cloneModel('truss');
      mount.position.copy(from).add(to).multiplyScalar(0.5);
      mount.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.clone().normalize());
      const width = 0.12 * gearStrutScale(p.type);
      mount.scale.set(width, delta.length(), width);
      craftRoot.add(mount);
      const fold = wheel.userData.gearFold,
        inner = wheel.userData.gearInner;
      if (fold instanceof T.Group && inner instanceof T.Group) {
        // Fold about the strut's top, in the wheel's own axes: where the physics puts the folded mass.
        fold.position.copy(gearFoldPivot(p, parent));
        inner.position.copy(fold.position).negate();
      }
      wheel.updateMatrixWorld();
      craftRoot.updateMatrixWorld(true);
      const holder = wheel.userData.gearInner;
      (holder instanceof T.Group ? holder : wheel).attach(mount);
    }
  }
}

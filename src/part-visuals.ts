// Part visuals (BACKLOG 7c, moved from app.ts): a part's 3D object (model, hinge, gimbal, wheel, RCS plumes,
// cargo) and the rebuild of the craft's objects under craftRoot. No import-time side effects.
import * as T from 'three';
import {PARTS} from './catalog.js';
import type {FlightPart, Flight} from './core.js';
import {RCS_NOZZLES} from './rcs.js';
import {syncCargoVisual} from './cargo-geometry.js';
import {disposeWreckVisual} from './failure-visuals.js';
import {state} from './app-state.js';
import {sceneCore, editorMarkers, objects, partObject} from './scene.js';
import {assetModel} from './asset-loader.js';
import {engineMaxThrust} from './resources.js';
import {screwRotor, screwSpinStep, screwSpinTarget} from './screw-spin.js';
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
  if (PARTS[p.type].controlAxis) {
    const hinge = new T.Group();
    hinge.position.y = PARTS[p.type].hingeY ?? PARTS[p.type].size[1] / 2;
    visual.position.y = -hinge.position.y;
    hinge.add(visual);
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
    o.add(steering);
    o.userData.steeringVisual = steering;
    o.userData.rollingVisual = rolling;
  } else o.add(visual);
  if (PARTS[p.type].water && PARTS[p.type].thrust) {
    const rotor = screwRotor(visual);
    if (rotor) o.userData.rotor = rotor;
  }
  if (PARTS[p.type].rcsThrust) {
    o.userData.rcsPlumes = RCS_NOZZLES.map(n => {
      const plume = new T.Mesh(
        new T.ConeGeometry(0.07, 0.5, 12),
        new T.MeshBasicMaterial({color: '#b7e9ff', transparent: true, opacity: 0.6, depthWrite: false})
      );
      const exhaust = new T.Vector3(...n.direction).negate();
      plume.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), exhaust.clone().negate());
      plume.position.fromArray(n.position).addScaledVector(exhaust, 0.25);
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
  disposeWreckVisual(craftRoot);
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
      to = new T.Vector3(parent.p[0], parent.p[1] - 0.25, p.p[2]),
      delta = to.clone().sub(from);
    if (delta.length() > 0.2 && delta.length() < 3) {
      const mount = cloneModel('truss');
      mount.position.copy(from).add(to).multiplyScalar(0.5);
      mount.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.clone().normalize());
      mount.scale.set(0.12, delta.length(), 0.12);
      craftRoot.add(mount);
      wheel.updateMatrixWorld();
      const world = mount.matrixWorld.clone();
      craftRoot.updateMatrixWorld(true);
      wheel.attach(mount);
    }
  }
}

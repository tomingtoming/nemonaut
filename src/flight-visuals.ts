// Flight visuals (BACKLOG 7c, moved from app.ts unchanged): the engine plumes and parachute canopies of the
// controlled vessel, the visuals of separated vessels (debris) with their plumes and canopies, and the name of
// a vessel's control part. The registries are plain values; no import-time side effects on the DOM or scene.
import * as T from 'three';
import {markWreckVisual} from './failure-visuals.js';
import {syncCargoVisual} from './cargo-geometry.js';
import {syncEngineShrouds} from './engine-shrouds.js';
import {createEnginePlume, updateEnginePlume} from './engine-plume.js';
import {PARTS} from './catalog.js';
import type {Flight, FlightPart} from './core.js';
import {bodyUp} from './celestial.js';
import {sceneCore} from './scene.js';
import {assets} from './asset-loader.js';
import {cloneModel, makePartVisual, updateRCSVisual, updateScrewVisual} from './part-visuals.js';
export const parachuteVisuals = new Map();
export const debrisVisuals = new Map<Flight, T.Group>();
export const exhaust: {id: string; mesh: ReturnType<typeof createEnginePlume>}[] = [];
export function allDebris(f: Flight): Flight[] {
  return f.detached.flatMap(child => [child, ...allDebris(child)]);
}
export function updateDebrisVisuals(root: Flight, now: number) {
  const {testWorld} = sceneCore();
  for (const f of allDebris(root)) {
    let group = debrisVisuals.get(f);
    if (!group) {
      group = new T.Group();
      for (const p of f.parts) {
        const o = makePartVisual(p);
        if (PARTS[p.type].thrust && !PARTS[p.type].water) {
          const flame = createEnginePlume(PARTS[p.type], !!o.userData.gimbal);
          const target = o.userData.gimbal || o;
          target.add(flame);
          o.userData.debrisFlame = flame;
        }
        group.add(o);
      }
      testWorld.add(group);
      debrisVisuals.set(f, group);
      group.userData.canopies = new Map();
      for (const p of f.parts)
        if (PARTS[p.type].parachute) {
          const canopy = cloneModel('parachute-open');
          testWorld.add(canopy);
          group.userData.canopies.set(p.id, canopy);
        }
    }
    for (const [id, canopy] of group.userData.canopies) {
      const chute = f.chutes.get(id),
        p = f.parts.find(p => p.id === id);
      canopy.visible = !!p && !!chute && chute.fraction > 0;
      if (p && chute && canopy.visible) {
        canopy.position.fromArray(p.p).applyQuaternion(f.q).add(f.pos);
        canopy.quaternion.setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          bodyUp(canopy.position, f.universalTime)
        );
        const scale = Math.sqrt(chute.fraction);
        canopy.scale.set(scale, 0.45 + 0.55 * scale, scale);
      }
    }
    syncEngineShrouds(
      f.parts,
      new Map(group.children.map(o => [o.userData.partId, o])),
      assets.get('engine-shroud')
    );
    group.position.copy(f.pos);
    group.quaternion.copy(f.q);
    for (const o of group.children) {
      const id = o.userData.partId;
      o.visible = f.parts.some(p => p.id === id);
      markWreckVisual(o, f);
      updateRCSVisual(o, f);
      const cp = f.parts.find(p => p.id === id);
      if (cp) syncCargoVisual(o, cp, PARTS[cp.type]);
      if (cp) updateScrewVisual(o, f, cp);
      if (o.userData.debrisFlame) {
        updateEnginePlume(o.userData.debrisFlame, f.engineThrust.get(id) || 0, f.crashed, now);
      }
      if (o.userData.hinge) o.userData.hinge.rotation.x = f.deflections.get(id) || 0;
      if (o.userData.gimbal) {
        const g = f.gimbals.get(id);
        o.userData.gimbal.rotation.set(g?.x || 0, 0, g?.z || 0);
      }
      if (o.userData.rollingVisual) {
        const wheel = f.wheelMotion.get(id);
        o.userData.steeringVisual.position.y = -(wheel?.extension ?? 0);
        o.userData.steeringVisual.rotation.y = wheel?.steer || 0;
        o.userData.rollingVisual.rotation.x = wheel?.angle || 0;
      }
    }
  }
}
export function controlName(list: readonly FlightPart[]) {
  const control = list.find(p => PARTS[p.type].control);
  return control ? PARTS[control.type].name : '制御なし';
}

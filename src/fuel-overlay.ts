import * as T from 'three';
import {fuelNetworks, type ResourcePart} from './resources.js';
import {partCenter, type AeroPart} from './aero.js';
// Own only diagnostic geometry; never change Blender asset materials.
/** The part fields the fuel overlay reads (a catalog Part satisfies it). */
export type FuelOverlayPart = ResourcePart & AeroPart;
export interface FuelOverlay {
  group: T.Group;
  show(parts: readonly FuelOverlayPart[], id: string, objects: ReadonlyMap<string, T.Object3D>): void;
  clear(): void;
}
export function createFuelOverlay(scene: T.Object3D): FuelOverlay {
  // Every child of group is added by show() and listed in items.
  const group = new T.Group(),
    items: T.LineSegments<T.BufferGeometry, T.LineBasicMaterial>[] = [];
  scene.add(group);
  function clear(): void {
    for (const item of items.splice(0)) {
      item.geometry.dispose();
      item.material.dispose();
      group.remove(item);
    }
  }
  function show(
    parts: readonly FuelOverlayPart[],
    id: string,
    objects: ReadonlyMap<string, T.Object3D>
  ): void {
    clear();
    const network = fuelNetworks(parts).network.get(id);
    if (!network) return;
    const ids = new Set(network.parts.map(p => p.id)),
      tanks = new Set(network.tanks.map(p => p.id)),
      engines = new Set(network.engines.map(p => p.id));
    const centers = new Map<string, T.Vector3>(parts.map(p => [p.id, partCenter(p)])),
      segments: T.Vector3[] = [];
    for (const p of network.parts) {
      if (p.parent && ids.has(p.parent)) {
        const from = centers.get(p.id),
          to = centers.get(p.parent);
        if (!from || !to) throw Error('燃料系統の部品位置が見つかりません');
        segments.push(from, to);
      }
      if (!tanks.has(p.id) && !engines.has(p.id) && p.id !== id) continue;
      const object = objects.get(p.id);
      if (!object) continue;
      object.updateWorldMatrix(true, true);
      const box = new T.BoxHelper(
        object,
        tanks.has(p.id) ? 0x55dce8 : engines.has(p.id) ? 0xff9c56 : 0xb7d783
      );
      box.material.depthTest = false;
      box.renderOrder = 25;
      box.userData.fuelPartId = p.id;
      group.add(box);
      items.push(box);
    }
    if (segments.length) {
      const lines = new T.LineSegments(
        new T.BufferGeometry().setFromPoints(segments),
        new T.LineBasicMaterial({color: 0xb7d783, depthTest: false})
      );
      lines.renderOrder = 24;
      group.add(lines);
      items.push(lines);
    }
  }
  return {group, show, clear};
}

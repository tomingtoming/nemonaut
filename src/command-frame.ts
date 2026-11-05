import {Euler, Quaternion, Vector3} from 'three';
import type {Part, PartCatalog} from './catalog.js';

export function usesAxialControls(parts: readonly {type: string}[], catalog: PartCatalog): boolean {
  const definitions = parts.map(p => catalog[p.type]);
  // Preserve the existing priority when several command parts share a vessel.
  return (
    definitions.some(d => d.commandFrame === 'axial') ||
    (definitions.some(d => d.commandFrame === 'legacy-auto') &&
      definitions.some(d => d.thrust && d.thrustMedium === 'independent') &&
      !definitions.some(d => d.commandFrame === 'forward'))
  );
}

export function instrumentForward(axial: boolean, rotation: Quaternion): Vector3 {
  return new Vector3(0, axial ? 1 : 0, axial ? 0 : 1).applyQuaternion(rotation);
}

export const referenceDirections = ['正面', '逆向き', '右向き', '左向き'];
export function selectReference(parts: Part[], id: string, direction: number, catalog: PartCatalog) {
  const part = parts.find(p => p.id === id);
  if (
    !part ||
    !catalog[part.type].commandFrame ||
    !Number.isInteger(direction) ||
    direction < -1 ||
    direction > 3
  )
    return;
  if (direction === -1) {
    delete part.referenceDirection;
    return;
  }
  for (const p of parts) delete p.referenceDirection;
  part.referenceDirection = direction;
}

/** Rotate the historic assembly control axes into the mounted instrument frame. */
export function instrumentRotation(parts: Part[], axial: boolean, catalog: PartCatalog) {
  const primary =
    parts.find(p => p.referenceDirection !== undefined && catalog[p.type].commandFrame) ??
    parts.find(p => catalog[p.type].commandFrame === (axial ? 'axial' : 'forward')) ??
    parts.find(p => catalog[p.type].commandFrame);
  const rotation = new Quaternion();
  if (!primary) return rotation;
  rotation.setFromEuler(new Euler(...primary.r));
  const frame = catalog[primary.type].commandFrame;
  if (frame === 'forward') {
    // The standard cockpit mounting has local +Y toward the nose and local -X to starboard.
    rotation.multiply(new Quaternion().setFromEuler(new Euler(Math.PI / 2, Math.PI, 0)).invert());
    if (axial) rotation.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2));
  } else if (frame === 'axial' && !axial) {
    rotation.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2));
  }
  const angle = [0, Math.PI, Math.PI / 2, -Math.PI / 2][primary.referenceDirection ?? 0];
  if (angle)
    rotation.multiply(
      new Quaternion().setFromAxisAngle(axial ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0), angle)
    );
  return rotation;
}

import * as T from 'three';
import type {PartDefinition} from './catalog.js';

/** The model and pivot share the same local datum; rotating this group deflects the surface. */
export function makeSurfaceHinge(
  visual: T.Object3D,
  definition: Pick<PartDefinition, 'size' | 'hingePivot' | 'modelCenter'>
): T.Group {
  const hinge = new T.Group();
  hinge.position.fromArray(definition.hingePivot ?? [0, definition.size[1] / 2, 0]);
  if (definition.modelCenter) hinge.position.add(new T.Vector3(...definition.modelCenter));
  visual.position.sub(hinge.position);
  hinge.add(visual);
  return hinge;
}

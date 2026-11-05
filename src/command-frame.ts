import type {PartCatalog} from './catalog.js';

/** Compatibility bridge to the existing assembly-local Y/Z control frames.
 * Not a vehicle classification: part names are immaterial. Rotated command parts
 * and user-selected reference frames need a vector-based successor to rocketAxes.
 */
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

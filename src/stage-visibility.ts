// Own only temporary material clones. Blender assets can share their source
// materials across many parts and across workshop/flight scenes.
export interface StageMaterial {
  clone(): StageMaterial;
  dispose(): void;
  color?: {lerp(color: {r: number; g: number; b: number}, alpha: number): unknown};
  emissive?: {setRGB(r: number, g: number, b: number): unknown};
  emissiveIntensity?: number;
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
}
export interface StageMesh {
  isMesh?: boolean;
  material?: StageMaterial | StageMaterial[];
  castShadow: boolean;
  userData: {stageDiagnosticIgnore?: unknown};
}
interface StageEntry {
  mesh: StageMesh;
  original: StageMaterial | StageMaterial[];
  temporary: StageMaterial[];
  shadow: boolean;
}
type StageObject = import('three').Object3D;
export interface StageVisibility {
  update(ids: Iterable<string> | null | undefined): void;
  dispose(): void;
}
export function mountStageVisibility(getObjects: () => ReadonlyMap<string, StageObject>): StageVisibility {
  let entries: StageEntry[] = [],
    signature: string | null = null,
    previousObjects: [string, StageObject][] = [];
  function restore() {
    for (const {mesh, original, temporary, shadow} of entries) {
      mesh.material = original;
      mesh.castShadow = shadow;
      for (const m of temporary) m.dispose();
    }
    entries = [];
  }
  function update(ids: Iterable<string> | null | undefined) {
    const objects = [...getObjects().entries()],
      next = ids ? JSON.stringify([...ids].sort()) : null;
    if (
      next === signature &&
      objects.length === previousObjects.length &&
      objects.every(([id, o], i) => id === previousObjects[i][0] && o === previousObjects[i][1])
    )
      return;
    restore();
    signature = next;
    previousObjects = objects;
    if (!ids) return;
    const retained = new Set(ids);
    for (const [id, object] of objects)
      object.traverse((mesh: StageMesh) => {
        if (!mesh.isMesh || !mesh.material || mesh.userData.stageDiagnosticIgnore) return;
        const original = mesh.material,
          shadow = mesh.castShadow,
          temporary = [original].flat().map(source => {
            const m = source.clone();
            if (retained.has(id)) {
              m.color?.lerp({r: 0.12, g: 1, b: 0.5}, 0.3);
              if (m.emissive) {
                m.emissive.setRGB(0.02, 0.18, 0.08);
                m.emissiveIntensity = Math.max(source.emissiveIntensity || 0, 0.7);
              }
            } else {
              m.transparent = true;
              m.opacity = Math.min(source.opacity, 0.12);
              m.depthWrite = false;
            }
            return m;
          });
        mesh.material = Array.isArray(original) ? temporary : temporary[0];
        if (!retained.has(id)) mesh.castShadow = false;
        entries.push({mesh, original, temporary, shadow});
      });
  }
  return {
    update,
    dispose() {
      restore();
      signature = null;
      previousObjects = [];
    }
  };
}

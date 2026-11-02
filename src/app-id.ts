// Storage keys and save-format kinds. The game was renamed from Orbital Foundry to Omnivehicle
// on 2026-11-01: new data uses `omnivehicle-*`; older saves (`orbital-foundry-*`, including the
// frozen Golden v1/v2 baselines) are still accepted when read.
export const APP = 'omnivehicle',
  LEGACY_APP = 'orbital-foundry';
export const storageKey = (name: string): string => APP + '-' + name;
export const saveKind = (name: string): string => APP + '-' + name;
export const isSaveKind = (value: unknown, name: string): boolean =>
  value === APP + '-' + name || value === LEGACY_APP + '-' + name;
// Moves browser data saved under the old prefix to the new one, keeping newer data if both exist.
export function migrateLegacyStorage(storage: Storage | undefined = globalThis.localStorage): number {
  if (!storage) return 0;
  let moved = 0;
  try {
    const old: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(LEGACY_APP + '-')) old.push(k);
    }
    for (const k of old) {
      const next = APP + k.slice(LEGACY_APP.length),
        value = storage.getItem(k);
      if (value !== null && storage.getItem(next) === null) {
        storage.setItem(next, value);
        moved++;
      }
      storage.removeItem(k);
    }
  } catch {}
  return moved;
}

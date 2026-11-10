// Storage keys and save-format kinds. The game is Nemonaut since 2026-11-10 (Omnivehicle from
// 2026-11-01, Orbital Foundry before that): new data uses `nemonaut-*`; saves written under the
// earlier names (including the frozen Golden v1/v2 baselines) are still accepted when read.
export const APP = 'nemonaut',
  LEGACY_APPS = ['omnivehicle', 'orbital-foundry'];
export const storageKey = (name: string): string => APP + '-' + name;
export const saveKind = (name: string): string => APP + '-' + name;
export const isSaveKind = (value: unknown, name: string): boolean =>
  value === APP + '-' + name || LEGACY_APPS.some(old => value === old + '-' + name);
// Moves browser data saved under an earlier prefix to the current one. Newer data wins: the
// current prefix first, then the earlier names from newest to oldest.
export function migrateLegacyStorage(storage: Storage | undefined = globalThis.localStorage): number {
  if (!storage) return 0;
  let moved = 0;
  try {
    for (const legacy of LEGACY_APPS) {
      const old: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(legacy + '-')) old.push(k);
      }
      for (const k of old) {
        const next = APP + k.slice(legacy.length),
          value = storage.getItem(k);
        if (value !== null && storage.getItem(next) === null) {
          storage.setItem(next, value);
          moved++;
        }
        storage.removeItem(k);
      }
    }
  } catch {}
  return moved;
}

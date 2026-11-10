// Storage keys and save-format kinds. The game is Nemonaut since 2026-11-10 (Omnivehicle from
// 2026-11-01, Orbital Foundry before that): data is written as `nemonaut-*`. Save records whose
// kind carries an earlier name are still accepted when read, because the frozen Golden baselines
// were recorded under them; browser storage keys under the earlier names are not read.
export const APP = 'nemonaut',
  LEGACY_APPS = ['omnivehicle', 'orbital-foundry'];
export const storageKey = (name: string): string => APP + '-' + name;
export const saveKind = (name: string): string => APP + '-' + name;
export const isSaveKind = (value: unknown, name: string): boolean =>
  value === APP + '-' + name || LEGACY_APPS.some(old => value === old + '-' + name);

// Storage keys and save-format kinds. Data is written as `nemonaut-*`. The game had two earlier names
// (Omnivehicle, and Orbital Foundry before that). Save records whose kind carries an earlier name are
// still accepted when read, because the frozen Golden baselines were recorded under them; browser
// storage keys under the earlier names are not read.
export const APP = 'nemonaut',
  LEGACY_APPS = ['omnivehicle', 'orbital-foundry'];
export const storageKey = (name: string): string => APP + '-' + name;
export const saveKind = (name: string): string => APP + '-' + name;
export const isSaveKind = (value: unknown, name: string): boolean =>
  value === APP + '-' + name || LEGACY_APPS.some(old => value === old + '-' + name);

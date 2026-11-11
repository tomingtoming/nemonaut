// The start environments a flight can begin in. Saves, drafts, designs and launch requests all accept
// exactly this set. No import-time side effects.
export const FLIGHT_ENVIRONMENTS: readonly string[] = [
  'land',
  'runway',
  'water',
  'drop',
  'orbit',
  'entry',
  'moon-orbit',
  'moon-surface',
  'transfer'
];

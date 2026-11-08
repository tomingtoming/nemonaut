// Old TS behavior, expressed as independent EC balances for a 200 and a 1000 EC battery.
// Columns: initial EC, generation, load, seconds, final EC, delivered EC/s, supply ratio.
export const chargeCases = [
  [[100, 250], 0.8, 0, 106.25, [110, 325], 0, 1],
  [[100, 250], 0, 7, 5, [90, 225], 7, 1],
  [[1, 2], 0, 12, 0.5, [0, 0], 6, 0.5],
  [[199, 999], 0.8, 0, 10, [200, 1000], 0, 1],
  [[0, 0], 0.8, 1, 1, [0, 0], 0.8, 0.8],
  [[], 0.8, 1, 1, [], 0.8, 0.8],
  [[100, 250], 0, 120, 1 / 120, [100 - 2 / 7, 250 - 5 / 7], 120, 1]
];

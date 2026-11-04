// Category is a coarse naming check, not a vehicle kind or a physics capability.
export function codeFamilyErrors(parts, knownConflicts = {}) {
  const errors = [],
    families = new Map();
  for (const [id, part] of Object.entries(parts)) {
    const match = /^([A-Z]+)-[0-9]+(?:\.[0-9]+)?$/.exec(part.code);
    if (!match) {
      errors.push(`${id}: invalid model code`);
      continue;
    }
    const prefix = match[1];
    if (!families.has(prefix)) families.set(prefix, []);
    families.get(prefix).push([id, part.cat]);
  }
  for (const [prefix, members] of families) {
    if (new Set(members.map(([, category]) => category)).size < 2) continue;
    const known = knownConflicts[prefix];
    if (
      !known ||
      Object.keys(known).length !== members.length ||
      members.some(([id, category]) => known[id] !== category)
    ) {
      errors.push(
        `${prefix}: mixed categories (${members
          .map(([id]) => id)
          .sort()
          .join(', ')})`
      );
    }
  }
  for (const prefix of Object.keys(knownConflicts)) {
    const members = families.get(prefix) ?? [];
    if (new Set(members.map(([, category]) => category)).size < 2) {
      errors.push(`${prefix}: obsolete conflict exception`);
    }
  }
  return errors;
}

// Existing debt, not permission for additional parts to reuse these prefixes.
// Remove each entry when BACKLOG 10d resolves the naming conflict.
export const KNOWN_CODE_CONFLICTS = {
  RC: {rcs: '推進', parachute: '装備'},
  TF: {transportFuselage: '燃料', transportJet: '推進', jetLarge: '推進'}
};

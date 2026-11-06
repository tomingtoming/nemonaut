// Category is a coarse naming check, not a vehicle kind or a physics capability.
export function codeFamilyErrors(parts) {
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
    errors.push(
      `${prefix}: mixed categories (${members
        .map(([id]) => id)
        .sort()
        .join(', ')})`
    );
  }
  return errors;
}

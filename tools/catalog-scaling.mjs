// Dimensional checks for geometrically similar variants. Mass/thrust factors are
// tuning inputs, not claims of constant material density or engine similarity.
export function scalingErrors(parts, variants, overrides = {}) {
  const errors = [];
  const close = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  for (const [id, spec] of Object.entries(variants)) {
    const base = parts[spec.base],
      part = parts[id],
      s = spec.scale;
    if (
      !base ||
      !part ||
      !Number.isFinite(s) ||
      s <= 0 ||
      !Number.isFinite(spec.factor) ||
      spec.factor <= 0
    ) {
      errors.push(`${id}: invalid variant`);
      continue;
    }
    const expected = {};
    for (const field of ['size', 'ac', 'massCenter', 'hingePivot']) {
      if (base[field] !== undefined) expected[field] = base[field].map(v => v * s);
    }
    for (const [field, power] of [
      ['chord', 1],
      ['wing', 2],
      ['volume', 3],
      ['ballast', 3]
    ]) {
      if (base[field] !== undefined) expected[field] = base[field] * s ** power;
    }
    Object.assign(expected, overrides[id]);
    for (const [field, value] of Object.entries(expected)) {
      const actual = part[field];
      const valid = Array.isArray(value)
        ? Array.isArray(actual) &&
          actual.length === value.length &&
          value.every((v, i) => close(actual[i], v))
        : close(actual, value);
      if (!valid) errors.push(`${id}: ${field}`);
    }
  }
  return errors;
}

// Non-similar inner wing: explicitly redesigned area, chord and centers.
export const CURRENT_GEOMETRY_OVERRIDES = {
  transportWingRoot: {wing: 156.8, chord: 11.2, ac: [7, 0, 0], massCenter: [7, 0, 0]}
};

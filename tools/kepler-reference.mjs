// TypeScript solver retained as a migration oracle.
function stumpff(z) {
  if (Math.abs(z) < 0.01) {
    let c = 0.5,
      s = 1 / 6,
      ct = c,
      st = s;
    for (let k = 1; k < 12; k++) {
      ct *= -z / ((2 * k + 1) * (2 * k + 2));
      st *= -z / ((2 * k + 2) * (2 * k + 3));
      c += ct;
      s += st;
    }
    return {c, s};
  }
  if (z > 0) {
    const x2 = Math.sqrt(z);
    return {c: (1 - Math.cos(x2)) / z, s: (x2 - Math.sin(x2)) / (x2 * x2 * x2)};
  }
  const x = Math.sqrt(-z);
  return {c: (Math.cosh(x) - 1) / -z, s: (Math.sinh(x) - x) / (x * x * x)};
}
export function referenceDrift(position, velocity, mu, dt) {
  if (
    ![...position.toArray(), ...velocity.toArray(), mu, dt].every(Number.isFinite) ||
    mu <= 0 ||
    position.length() <= 0
  )
    throw Error('惰性飛行の条件が不正です');
  if (dt === 0) return {position: position.clone(), velocity: velocity.clone()};
  const r0 = position.length(),
    root = Math.sqrt(mu),
    rv = position.dot(velocity) / root,
    alpha = 2 / r0 - velocity.lengthSq() / mu;
  const equation = x2 => {
    const z = alpha * x2 * x2,
      {c: c2, s: s2} = stumpff(z);
    return {
      value: rv * x2 * x2 * c2 + (1 - alpha * r0) * x2 * x2 * x2 * s2 + r0 * x2 - root * dt,
      derivative: rv * x2 * (1 - z * s2) + (1 - alpha * r0) * x2 * x2 * c2 + r0,
      c: c2,
      s: s2
    };
  };
  let lo = 0,
    hi = Math.max(1, (root * Math.abs(dt)) / r0);
  if (dt < 0) {
    lo = -hi;
    hi = 0;
  }
  let bracketed = false;
  for (let i = 0; i < 128; i++) {
    if (equation(lo).value <= 0 && equation(hi).value >= 0) {
      bracketed = true;
      break;
    }
    if (dt > 0) hi *= 2;
    else lo *= 2;
  }
  if (!bracketed) throw Error('惰性飛行の解を囲めません');
  let x = (lo + hi) / 2,
    solved = false;
  for (let i = 0; i < 128; i++) {
    const e = equation(x);
    if (Math.abs(e.value) / root < 1e-12 * Math.max(1, Math.abs(dt))) {
      solved = true;
      break;
    }
    if (e.value > 0) hi = x;
    else lo = x;
    const candidate = x - e.value / e.derivative;
    x = Number.isFinite(candidate) && candidate > lo && candidate < hi ? candidate : (lo + hi) / 2;
  }
  if (!solved) throw Error('惰性飛行の計算が収束しません');
  const {c, s} = stumpff(alpha * x * x),
    f = 1 - (x * x * c) / r0,
    g = dt - (x * x * x * s) / root;
  const p = position.clone().multiplyScalar(f).addScaledVector(velocity, g),
    r = p.length();
  const fdot = (root / (r * r0)) * (alpha * x * x * x * s - x),
    gdot = 1 - (x * x * c) / r;
  const v = position.clone().multiplyScalar(fdot).addScaledVector(velocity, gdot);
  if (![...p.toArray(), ...v.toArray()].every(Number.isFinite)) throw Error('惰性飛行の結果が不正です');
  return {position: p, velocity: v};
}

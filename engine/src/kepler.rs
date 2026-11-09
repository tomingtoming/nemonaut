use std::cell::Cell;

// Private to one single-threaded Wasm instance. The caller copies six doubles.
thread_local! { static OUTPUT: Cell<[f64; 6]> = const { Cell::new([0.; 6]) }; }

fn stumpff(z: f64) -> (f64, f64) {
    if z.abs() < 0.01 {
        let (mut c, mut s) = (0.5, 1.0 / 6.0);
        let (mut ct, mut st) = (c, s);
        for k in 1..12 {
            ct *= -z / ((2 * k + 1) * (2 * k + 2)) as f64;
            st *= -z / ((2 * k + 2) * (2 * k + 3)) as f64;
            c += ct;
            s += st;
        }
        (c, s)
    } else if z > 0.0 {
        let x = z.sqrt();
        ((1.0 - x.cos()) / z, (x - x.sin()) / (x * x * x))
    } else {
        let x = (-z).sqrt();
        ((x.cosh() - 1.0) / -z, (x.sinh() - x) / (x * x * x))
    }
}

fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

// Positive: pointer to output. Negative: invalid input, bracketing, convergence, or output.
#[unsafe(no_mangle)]
pub extern "C" fn kepler_drift(
    px: f64,
    py: f64,
    pz: f64,
    vx: f64,
    vy: f64,
    vz: f64,
    mu: f64,
    dt: f64,
) -> isize {
    let p = [px, py, pz];
    let v = [vx, vy, vz];
    let r0 = dot(p, p).sqrt();
    if ![px, py, pz, vx, vy, vz, mu, dt]
        .iter()
        .all(|a| a.is_finite())
        || mu <= 0.0
        || r0 <= 0.0
    {
        return -1;
    }
    let mut out = [px, py, pz, vx, vy, vz];
    if dt != 0.0 {
        let root = mu.sqrt();
        let rv = dot(p, v) / root;
        let alpha = 2.0 / r0 - dot(v, v) / mu;
        let equation = |x: f64| {
            let z = alpha * x * x;
            let (c, s) = stumpff(z);
            (
                rv * x * x * c + (1.0 - alpha * r0) * x * x * x * s + r0 * x - root * dt,
                rv * x * (1.0 - z * s) + (1.0 - alpha * r0) * x * x * c + r0,
            )
        };
        let bound = (root * dt.abs() / r0).max(1.0);
        let (mut lo, mut hi) = if dt < 0.0 {
            (-bound, 0.0)
        } else {
            (0.0, bound)
        };
        let bracketed = (0..128).any(|_| {
            if equation(lo).0 <= 0.0 && equation(hi).0 >= 0.0 {
                return true;
            }
            if dt > 0.0 {
                hi *= 2.0;
            } else {
                lo *= 2.0;
            }
            false
        });
        if !bracketed {
            return -2;
        }
        let mut x = (lo + hi) / 2.0;
        let solved = (0..128).any(|_| {
            let (value, derivative) = equation(x);
            if value.abs() / root < 1e-12 * dt.abs().max(1.0) {
                return true;
            }
            if value > 0.0 {
                hi = x;
            } else {
                lo = x;
            }
            let candidate = x - value / derivative;
            x = if candidate > lo && candidate < hi && candidate.is_finite() {
                candidate
            } else {
                (lo + hi) / 2.0
            };
            false
        });
        if !solved {
            return -3;
        }
        let (c, s) = stumpff(alpha * x * x);
        let f = 1.0 - x * x * c / r0;
        let g = dt - x * x * x * s / root;
        for i in 0..3 {
            out[i] = p[i] * f + v[i] * g;
        }
        let next = [out[0], out[1], out[2]];
        let r = dot(next, next).sqrt();
        let fdot = root / (r * r0) * (alpha * x * x * x * s - x);
        let gdot = 1.0 - x * x * c / r;
        for i in 0..3 {
            out[i + 3] = p[i] * fdot + v[i] * gdot;
        }
        if !out.iter().all(|a| a.is_finite()) {
            return -4;
        }
    }
    OUTPUT.with(|cell| {
        cell.set(out);
        cell.as_ptr() as isize
    })
}

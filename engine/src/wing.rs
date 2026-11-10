//! Batched wing loads for a single physics step. The caller supplies the deflected surface basis in world coordinates.
use std::cell::RefCell;
use std::f64::consts::{FRAC_PI_2, PI};

thread_local! {
    static ROWS: RefCell<Vec<[f64; 14]>> = const { RefCell::new(Vec::new()) };
}

fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn calculate(input: [f64; 14]) -> [f64; 6] {
    let [
        vx,
        vy,
        vz,
        sx,
        sy,
        sz,
        nx,
        ny,
        nz,
        fx,
        fy,
        fz,
        density,
        area,
    ] = input;
    let velocity = [vx, vy, vz];
    let span = [sx, sy, sz];
    let normal = [nx, ny, nz];
    let across = dot(velocity, span);
    let flow = std::array::from_fn(|i| velocity[i] - across * span[i]);
    let speed = dot(flow, flow).sqrt();
    let mut result = [0.0; 6];
    if speed >= 0.05 {
        let alpha = (-dot(flow, normal)).atan2(dot(flow, [fx, fy, fz]));
        let stall = 15.0 * PI / 180.0;
        let stalled = alpha.abs() > stall;
        let cl = if stalled {
            alpha.signum() * 1.18 * ((alpha.abs() - stall) * 1.4).min(FRAC_PI_2).cos()
        } else {
            4.5 * alpha
        };
        let cd = 0.022 + 0.065 * cl * cl + 1.2 * alpha.sin().powi(2);
        let direction = flow.map(|v| v * speed.recip());
        let along = dot(normal, direction);
        let lift = std::array::from_fn(|i| normal[i] - along * direction[i]);
        let length = dot(lift, lift).sqrt();
        let inverse = if length == 0.0 { 1.0 } else { length.recip() };
        let q = 0.5 * density * speed * speed * area;
        for i in 0..3 {
            result[i] = lift[i] * inverse * (q * cl) - direction[i] * (q * cd);
        }
        result[3..].copy_from_slice(&[alpha, cl, u8::from(stalled) as f64]);
    }
    result
}

#[unsafe(no_mangle)]
pub extern "C" fn wing_prepare(count: usize) -> *mut f64 {
    ROWS.with_borrow_mut(|rows| {
        rows.resize(count, [0.0; 14]);
        rows.as_mut_ptr().cast()
    })
}

/// Replace the first six fields of each prepared row with its flight result.
#[unsafe(no_mangle)]
pub extern "C" fn wing_batch() {
    ROWS.with_borrow_mut(|rows| {
        for row in rows {
            let result = calculate(*row);
            row[..6].copy_from_slice(&result);
        }
    })
}

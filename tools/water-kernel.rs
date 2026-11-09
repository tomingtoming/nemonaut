//! Two samples per part. Velocities, water-up and output forces are in part-local coordinates.
use std::cell::RefCell;

// altitude, vertical half extent, displaced volume, gravity, velocity[3], up[3],
// damping factors[3], planing area, inverse effective mass along local -Z.
type Row = [f64; 15];
thread_local! {
    static ROWS: RefCell<Vec<Row>> = const { RefCell::new(Vec::new()) };
}

#[unsafe(no_mangle)]
pub extern "C" fn water_prepare(count: usize) -> *mut f64 {
    ROWS.with_borrow_mut(|rows| {
        rows.resize(count, [0.0; 15]);
        rows.as_mut_ptr().cast()
    })
}

fn calculate(row: &mut Row, dt: f64, planing_samples: f64) {
    let [
        altitude,
        extent,
        volume,
        gravity,
        vx,
        vy,
        vz,
        ux,
        uy,
        uz,
        dx,
        dy,
        dz,
        area,
        inverse_mass,
    ] = *row;
    let depth = (1.2 * extent).max(0.12);
    let wet = (0.5 - altitude / depth).clamp(0.0, 1.0);
    let displaced_mass = 500.0 * volume * wet;
    let buoyancy = displaced_mass * gravity;
    let lift = if area > 0.0 && uz < 0.0 && vz > 0.0 && wet > 0.0 && wet < 1.0 {
        let speed = (vx * vx + vy * vy + vz * vz).sqrt();
        let pressure = 1000.0 * area * speed * vz * wet * (1.0 - wet);
        pressure.min(vz / (dt * inverse_mass * planing_samples))
    } else {
        0.0
    };
    row[..8].copy_from_slice(&[
        wet,
        ux * buoyancy,
        uy * buoyancy,
        uz * buoyancy,
        -vx * dx * displaced_mass,
        -vy * dy * displaced_mass,
        -vz * dz * displaced_mass,
        lift,
    ]);
}

#[unsafe(no_mangle)]
pub extern "C" fn water_step(dt: f64, planing_samples: usize) {
    ROWS.with_borrow_mut(|rows| {
        for row in rows {
            calculate(row, dt, planing_samples as f64);
        }
    });
}

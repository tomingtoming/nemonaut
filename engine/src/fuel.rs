// Fuel accounting for one vessel across all connected supply groups.
// Each engine row contains max thrust (overwritten with delivered thrust),
// vacuum Isp, sea-level Isp, air-breathing flag and intake exposure.
// Tank masses follow the engine rows in the same order as the caller's IDs.
use std::cell::RefCell;

const STRIDE: usize = 5;
thread_local! {
    static BUFFER: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
}

#[unsafe(no_mangle)]
pub extern "C" fn fuel_prepare(length: usize) -> *mut f64 {
    BUFFER.with_borrow_mut(|data| {
        data.resize(length, 0.0);
        data.as_mut_ptr()
    })
}

fn burn_group(
    data: &mut [f64],
    count: usize,
    throttle: f64,
    density: f64,
    pressure: f64,
    dt: f64,
) -> bool {
    let (rows, tanks) = data.split_at_mut(count * STRIDE);
    let mut need = 0.0;
    for row in rows.chunks_exact_mut(STRIDE) {
        let isp = row[1] + (row[2] - row[1]) * (pressure / 101325.0).clamp(0.0, 1.0);
        let factor = if row[3] != 0.0 {
            (density / 1.225) * row[4]
        } else {
            isp / row[1]
        };
        row[0] = row[0] * throttle * factor;
        need += row[0] * dt / (isp * 9.81);
    }
    // Match the positive-zero initial value of the TS tank reduction for empty supplies.
    let available = tanks.iter().fold(0.0, |total, mass| total + mass);
    let fraction = if need > 0.0 {
        (available / need).min(1.0)
    } else {
        0.0
    };
    for row in rows.chunks_exact_mut(STRIDE) {
        row[0] *= fraction;
    }
    if available <= 0.0 || need <= 0.0 {
        return false;
    }
    let remaining = if need >= available {
        0.0
    } else {
        1.0 - need / available
    };
    for tank in tanks {
        *tank *= remaining;
    }
    true
}
// Each group starts with two counts; replace the first with the tank-write flag.
#[unsafe(no_mangle)]
pub extern "C" fn fuel_burn_vessel(throttle: f64, density: f64, pressure: f64, dt: f64) {
    BUFFER.with_borrow_mut(|buffer| {
        let mut groups = buffer.as_mut_slice();
        while !groups.is_empty() {
            let (header, tail) = groups.split_at_mut(2);
            let engines = header[0] as usize;
            let (group, rest) = tail.split_at_mut(engines * STRIDE + header[1] as usize);
            header[0] = if burn_group(group, engines, throttle, density, pressure, dt) {
                1.0
            } else {
                0.0
            };
            groups = rest;
        }
    });
}

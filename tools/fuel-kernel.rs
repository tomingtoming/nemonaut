// Standalone experiment, one call per connected fuel supply.
// Each engine row contains max thrust (overwritten with delivered thrust),
// vacuum Isp, sea-level Isp, air-breathing flag and intake exposure.
// Tank masses follow the engine rows in the same order as the caller's IDs.
use std::cell::RefCell;

const STRIDE: usize = 5;
thread_local! {
    static BUFFER: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
}

#[unsafe(no_mangle)]
pub extern "C" fn prepare(length: usize) -> *mut f64 {
    BUFFER.with_borrow_mut(|data| {
        data.resize(length, 0.0);
        data.as_mut_ptr()
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn burn(count: usize, throttle: f64, density: f64, pressure: f64, dt: f64) -> bool {
    BUFFER.with_borrow_mut(|data| {
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
        let available: f64 = tanks.iter().sum();
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
    })
}

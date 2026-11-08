// Coast cooling. One row per part, in the order of the caller's state map lookup.
use std::cell::RefCell;
#[repr(C)]
#[derive(Clone, Default)]
struct Row {
    temperature: f64,
    radiation: f64,
    convection: f64,
}
thread_local! {
    static ROWS: RefCell<Vec<Row>> = const { RefCell::new(Vec::new()) };
}
#[unsafe(no_mangle)]
pub extern "C" fn coast_cooling_prepare(count: usize) -> usize {
    ROWS.with_borrow_mut(|rows| {
        rows.resize(count, Row::default());
        rows.as_mut_ptr() as usize
    })
}
// Return the completed prefix on success or budget exhaustion; a negative result encodes an invalid row.
#[unsafe(no_mangle)]
pub extern "C" fn coast_cooling_step(dt: f64, ambient: f64) -> isize {
    ROWS.with_borrow_mut(|rows| {
        for (index, row) in rows.iter_mut().enumerate() {
            let mut t = row.temperature;
            if !t.is_finite() || t < 3.0 {
                return -(index as isize) - 1;
            }
            let mut left = dt;
            let rate = |n: f64| {
                -row.radiation * (n.powi(4) - ambient.powi(4)) - row.convection * (n - ambient)
            };
            for _ in 0..10000 {
                let h = left
                    .min(0.04 / (4.0 * row.radiation * t.max(ambient).powi(3) + row.convection));
                let mid = t + rate(t) * h / 2.0;
                t = (t + rate(mid) * h).clamp(t.min(ambient), t.max(ambient));
                left -= h;
                if left <= 0.0 {
                    break;
                }
            }
            if left > 0.0 {
                return index as isize;
            }
            row.temperature = t;
        }
        rows.len() as isize
    })
}

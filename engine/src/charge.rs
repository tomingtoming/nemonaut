// Per-instance charge accounting scratch buffer. The backing storage belongs to one Wasm instance;
// JS only retains its view until the next prepare call.
use std::cell::RefCell;

const OUTPUTS: usize = 5;
thread_local! {
    static BUFFER: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
}

#[unsafe(no_mangle)]
pub extern "C" fn charge_prepare(batteries: usize) -> *mut f64 {
    BUFFER.with_borrow_mut(|buf| {
        buf.resize(OUTPUTS + batteries * 2, 0.0);
        buf.as_mut_ptr()
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn charge_distribute(generation: f64, demand: f64, dt: f64) {
    BUFFER.with_borrow_mut(|buf| {
        let (out, cells) = buf.split_at_mut(OUTPUTS);
        let mut stored = 0.0;
        let mut capacity = 0.0;
        for cell in cells.chunks_exact(2) {
            capacity += cell[0];
            stored += cell[1];
        }
        let available = stored + generation * dt;
        let consumed = available.min(demand * dt);
        let ratio = if demand > 0.0 {
            (available / (demand * dt)).min(1.0)
        } else {
            1.0
        };
        let next = (available - consumed).clamp(0.0, capacity);
        let change = next - stored;
        for cell in cells.chunks_exact_mut(2) {
            let share = if change >= 0.0 && capacity > stored {
                (cell[0] - cell[1]) / (capacity - stored)
            } else if change < 0.0 && stored > 0.0 {
                cell[1] / stored
            } else {
                0.0
            };
            cell[1] = (cell[1] + change * share).clamp(0.0, cell[0]);
        }
        out.copy_from_slice(&[next, capacity, consumed / dt, ratio, change / dt]);
    });
}

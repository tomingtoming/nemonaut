// Standalone diagnostic adapter, linked directly to one existing Rapier Wasm instance.
use std::cell::RefCell;

#[link(wasm_import_module = "engine")]
unsafe extern "C" {
    fn body_add_force_at_point(fx: f64, fy: f64, fz: f64, px: f64, py: f64, pz: f64) -> u32;
}
thread_local! {
    static LOADS: RefCell<Vec<[f64; 6]>> = const { RefCell::new(Vec::new()) };
}

#[unsafe(no_mangle)]
pub extern "C" fn prepare(count: usize) -> *mut f64 {
    LOADS.with_borrow_mut(|loads| {
        loads.resize(count, [0.0; 6]);
        loads.as_mut_ptr().cast()
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn apply(count: usize) -> u32 {
    LOADS.with_borrow(|loads| {
        let Some(active) = loads.get(..count) else {
            return 0;
        };
        for &[fx, fy, fz, px, py, pz] in active {
            if unsafe { body_add_force_at_point(fx, fy, fz, px, py, pz) } != 1 {
                return 0;
            }
        }
        1
    })
}

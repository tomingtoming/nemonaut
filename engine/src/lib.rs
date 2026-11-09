//! Migration diagnostic kernel. Not yet the authoritative game simulation.
use rapier3d::prelude::*;
use std::cell::RefCell;
mod celestial;
mod charge;
mod coast_cooling;
mod craft;
mod fuel;
mod kepler;
mod pair;
mod thermal;
mod wing;

struct Kernel {
    world: PhysicsWorld,
    body: RigidBodyHandle,
    ticks: u32,
    origin: [f64; 3],
    initial: [f64; 2],
    commands: Vec<[f64; 9]>,
}
thread_local! {
    static KERNEL: RefCell<Option<Kernel>> = const { RefCell::new(None) };
    static SAVE: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
    static LOAD: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
}

/// Diagnostic ABI v2: one persistent test body per Wasm instance.
/// Invalid reset/step leaves the existing state untouched and returns 0.
#[unsafe(no_mangle)]
pub extern "C" fn kernel_reset(height: f64, ground: f64) -> u32 {
    if !height.is_finite() || height.abs() > 10000.0 || (ground != 0.0 && ground != 1.0) {
        return 0;
    }
    let mut world = PhysicsWorld::default();
    world.integration_parameters.dt = 1.0 / 120.0;
    world.integration_parameters.num_solver_iterations = 8;
    if ground == 1.0 {
        world.colliders.insert(
            ColliderBuilder::cuboid(2000.0, 1.0, 2000.0)
                .translation(Vector::new(0.0, -1.0, 0.0))
                .friction(0.3),
        );
    }
    let (body, _) = world.insert(
        RigidBodyBuilder::dynamic()
            .translation(Vector::new(0.0, height as f32, 0.0))
            .can_sleep(false)
            .ccd_enabled(true),
        ColliderBuilder::cuboid(0.5, 0.4, 0.7).mass(10.0),
    );
    KERNEL.with(|s| {
        *s.borrow_mut() = Some(Kernel {
            world,
            body,
            ticks: 0,
            origin: [0.0; 3],
            initial: [height, ground],
            commands: Vec::new(),
        })
    });
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn kernel_step(
    fx: f64,
    fy: f64,
    fz: f64,
    tx: f64,
    ty: f64,
    tz: f64,
    scale: f64,
    gravity: f64,
) -> u32 {
    if ![fx, fy, fz, tx, ty, tz, gravity]
        .iter()
        .all(|v| v.is_finite() && v.abs() <= 1e6)
        || !scale.is_finite()
        || !(1.0..=100.0).contains(&scale)
    {
        return 0;
    }
    KERNEL.with(|s| {
        let mut state = s.borrow_mut();
        let Some(k) = state.as_mut() else {
            return 0;
        };
        if k.commands.len() >= 7200 {
            return 0;
        }
        let p = &mut k.world.integration_parameters;
        p.length_unit = scale as f32;
        p.normalized_allowed_linear_error = (0.001 / scale) as f32;
        p.normalized_prediction_distance = (0.005 / scale) as f32;
        k.world.gravity = Vector::new(0.0, gravity as f32, 0.0);
        let b = &mut k.world.bodies[k.body];
        b.reset_forces(true);
        b.reset_torques(true);
        b.add_force(Vector::new(fx as f32, fy as f32, fz as f32), true);
        b.add_torque(Vector::new(tx as f32, ty as f32, tz as f32), true);
        k.world.step();
        k.ticks += 1;
        k.commands
            .push([0.0, fx, fy, fz, tx, ty, tz, scale, gravity]);
        1
    })
}

/// Read-only scalar snapshot: xyz, velocity xyz, quaternion xyzw, omega xyz, ticks.
#[unsafe(no_mangle)]
pub extern "C" fn kernel_read(index: u32) -> f64 {
    KERNEL.with(|s| {
        let state = s.borrow();
        let Some(k) = state.as_ref() else {
            return f64::NAN;
        };
        let b = &k.world.bodies[k.body];
        let p = b.translation();
        let v = b.linvel();
        let q = b.rotation();
        let w = b.angvel();
        let values = [
            p.x, p.y, p.z, v.x, v.y, v.z, q.x, q.y, q.z, q.w, w.x, w.y, w.z,
        ];
        if index < 3 {
            values[index as usize] as f64 + k.origin[index as usize]
        } else if index == 13 {
            k.ticks as f64
        } else {
            values.get(index as usize).map_or(f64::NAN, |v| *v as f64)
        }
    })
}

/// Shift local coordinates while keeping observed world coordinates unchanged.
#[unsafe(no_mangle)]
pub extern "C" fn kernel_shift(x: f64, y: f64, z: f64) -> u32 {
    if ![x, y, z].iter().all(|v| v.is_finite() && v.abs() <= 1000.0) {
        return 0;
    }
    KERNEL.with(|s| {
        let mut state = s.borrow_mut();
        let Some(k) = state.as_mut() else {
            return 0;
        };
        // Contact-space relocation is not accepted yet: f32 coordinate changes
        // alter contact trajectories beyond the diagnostic parity threshold.
        if k.initial[1] == 1.0 {
            return 0;
        }
        if k.commands.len() >= 7200 {
            return 0;
        }
        let delta = Vector::new(x as f32, y as f32, z as f32);
        // Use the actual f32 translation in the f64 origin to avoid mismatched deltas.
        let b = &mut k.world.bodies[k.body];
        let next = b.translation() - delta;
        if next.abs().max_element() > 10000.0 {
            return 0;
        }
        b.set_translation(next, true);
        for (_, c) in k.world.colliders.iter_mut() {
            if c.parent().is_none() {
                c.set_translation(c.translation() - delta);
            }
        }
        k.origin[0] += delta.x as f64;
        k.origin[1] += delta.y as f64;
        k.origin[2] += delta.z as f64;
        k.commands.push([1.0, x, y, z, 0.0, 0.0, 0.0, 0.0, 0.0]);
        1
    })
}

/// Versioned diagnostic replay save: [version, height, ground, command_count, 9*N commands].
/// Bounded to 7200 commands; preserves solver history by replaying all accepted commands.
#[unsafe(no_mangle)]
pub extern "C" fn kernel_save() -> u32 {
    KERNEL.with(|s| {
        let state = s.borrow();
        let Some(k) = state.as_ref() else {
            return 0;
        };
        let mut data = vec![1.0, k.initial[0], k.initial[1], k.commands.len() as f64];
        for c in &k.commands {
            data.extend_from_slice(c);
        }
        let len = data.len() as u32;
        SAVE.with(|b| *b.borrow_mut() = data);
        len
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn kernel_save_read(index: u32) -> f64 {
    SAVE.with(|b| b.borrow().get(index as usize).copied().unwrap_or(f64::NAN))
}
#[unsafe(no_mangle)]
pub extern "C" fn kernel_load_begin() {
    LOAD.with(|b| b.borrow_mut().clear());
}
#[unsafe(no_mangle)]
pub extern "C" fn kernel_load_push(value: f64) -> u32 {
    LOAD.with(|b| {
        let mut b = b.borrow_mut();
        if b.len() >= 64804 {
            return 0;
        }
        b.push(value);
        1
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn kernel_load_commit() -> u32 {
    let data = LOAD.with(|b| std::mem::take(&mut *b.borrow_mut()));
    if data.len() < 4
        || !data.iter().all(|v| v.is_finite())
        || data[0] != 1.0
        || data[3] < 0.0
        || data[3] > 7200.0
        || data[3].fract() != 0.0
        || data.len() != 4 + data[3] as usize * 9
    {
        return 0;
    }
    // Preserve the original world until the complete replay has succeeded.
    let old = KERNEL.with(|s| s.borrow_mut().take());
    let mut ok = kernel_reset(data[1], data[2]) == 1;
    if ok {
        for c in data[4..].chunks_exact(9) {
            let accepted = if c[0] == 0.0 {
                kernel_step(c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8])
            } else if c[0] == 1.0 && c[4..].iter().all(|v| *v == 0.0) {
                kernel_shift(c[1], c[2], c[3])
            } else {
                0
            };
            if accepted != 1 {
                ok = false;
                break;
            }
        }
    }
    if !ok {
        KERNEL.with(|s| *s.borrow_mut() = old);
        return 0;
    }
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn kernel_dispose() {
    KERNEL.with(|s| *s.borrow_mut() = None);
    SAVE.with(|b| b.borrow_mut().clear());
    LOAD.with(|b| b.borrow_mut().clear());
}

/// ABI v1: SI units, local f32 contact space, fixed 120 Hz, result in meters.
/// Invalid/unbounded inputs return NaN without constructing a world.
#[unsafe(no_mangle)]
pub extern "C" fn fall_y(ticks: u32, height: f64, velocity: f64, ground: u32) -> f64 {
    if ticks > 7200
        || !height.is_finite()
        || !velocity.is_finite()
        || height.abs() > 10000.0
        || velocity.abs() > 10000.0
        || ground > 1
    {
        return f64::NAN;
    }
    let mut world = PhysicsWorld::default();
    world.integration_parameters.dt = 1.0 / 120.0;
    if ground == 1 {
        world.insert(
            RigidBodyBuilder::fixed().translation(Vector::new(0.0, -0.1, 0.0)),
            ColliderBuilder::cuboid(100.0, 0.1, 100.0),
        );
    }
    let (body, _) = world.insert(
        RigidBodyBuilder::dynamic()
            .translation(Vector::new(0.0, height as f32, 0.0))
            .linvel(Vector::new(0.0, velocity as f32, 0.0)),
        ColliderBuilder::ball(0.5),
    );
    for _ in 0..ticks {
        world.step();
    }
    world.bodies[body].translation().y as f64
}

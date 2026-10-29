//! Migration diagnostic kernel. Not yet the authoritative game simulation.
use rapier3d::prelude::*;
use std::cell::RefCell;

struct Kernel {
    world: PhysicsWorld,
    body: RigidBodyHandle,
    ticks: u32,
}
thread_local! {
    static KERNEL: RefCell<Option<Kernel>> = const { RefCell::new(None) };
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
        if k.ticks >= 7200 {
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
        if index == 13 {
            k.ticks as f64
        } else {
            values.get(index as usize).map_or(f64::NAN, |v| *v as f64)
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn kernel_dispose() {
    KERNEL.with(|s| *s.borrow_mut() = None);
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

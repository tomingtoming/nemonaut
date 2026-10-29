//! Real craft geometry boundary, diagnostic only. No planetary/game ownership yet.
use rapier3d::prelude::*;
use std::cell::RefCell;
struct Craft {
    world: PhysicsWorld,
    body: RigidBodyHandle,
    shapes: Vec<ColliderHandle>,
    ticks: u32,
}

/// Shadow replay only: import the exact solver pre-state owned by the JS game.
#[unsafe(no_mangle)]
pub extern "C" fn craft_state(
    px: f64,
    py: f64,
    pz: f64,
    vx: f64,
    vy: f64,
    vz: f64,
    qx: f64,
    qy: f64,
    qz: f64,
    qw: f64,
    wx: f64,
    wy: f64,
    wz: f64,
) -> u32 {
    if ![px, py, pz, vx, vy, vz, qx, qy, qz, qw, wx, wy, wz]
        .iter()
        .all(|v| v.is_finite() && v.abs() <= 1e9)
        || (qx * qx + qy * qy + qz * qz + qw * qw - 1.0).abs() > 0.0001
    {
        return 0;
    }
    CRAFT.with(|s| {
        let mut state = s.borrow_mut();
        let Some(c) = state.as_mut() else {
            return 0;
        };
        let b = &mut c.world.bodies[c.body];
        b.recompute_mass_properties_from_colliders(&c.world.colliders);
        b.set_translation(Vector::new(px as f32, py as f32, pz as f32), true);
        b.set_rotation(
            Rotation::from_xyzw(qx as f32, qy as f32, qz as f32, qw as f32),
            true,
        );
        b.set_linvel(Vector::new(vx as f32, vy as f32, vz as f32), true);
        b.set_angvel(Vector::new(wx as f32, wy as f32, wz as f32), true);
        1
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn craft_solver_step(
    fx: f64,
    fy: f64,
    fz: f64,
    tx: f64,
    ty: f64,
    tz: f64,
    gx: f64,
    gy: f64,
    gz: f64,
    dt: f64,
    scale: f64,
    error: f64,
    prediction: f64,
) -> u32 {
    if ![
        fx, fy, fz, tx, ty, tz, gx, gy, gz, dt, scale, error, prediction,
    ]
    .iter()
    .all(|v| v.is_finite() && v.abs() <= 1e9)
        || dt <= 0.0
        || dt > 0.1
        || !(1.0..=100.0).contains(&scale)
        || error < 0.0
        || prediction < 0.0
    {
        return 0;
    }
    CRAFT.with(|s| {
        let mut state = s.borrow_mut();
        let Some(c) = state.as_mut() else {
            return 0;
        };
        if c.shapes.is_empty() || c.ticks >= 7200 {
            return 0;
        }
        let b = &mut c.world.bodies[c.body];
        b.recompute_mass_properties_from_colliders(&c.world.colliders);
        if b.mass() <= 0.0 {
            return 0;
        }
        b.reset_forces(true);
        b.reset_torques(true);
        b.add_force(Vector::new(fx as f32, fy as f32, fz as f32), true);
        b.add_torque(Vector::new(tx as f32, ty as f32, tz as f32), true);
        c.world.gravity = Vector::new(gx as f32, gy as f32, gz as f32);
        let p = &mut c.world.integration_parameters;
        p.dt = dt as f32;
        p.length_unit = scale as f32;
        p.normalized_allowed_linear_error = error as f32;
        p.normalized_prediction_distance = prediction as f32;
        c.world.step();
        c.ticks += 1;
        1
    })
}
thread_local! { static CRAFT: RefCell<Option<Craft>> = const { RefCell::new(None) }; }
#[unsafe(no_mangle)]
pub extern "C" fn craft_reset() {
    let mut world = PhysicsWorld::default();
    world.gravity = Vector::ZERO;
    let p = &mut world.integration_parameters;
    p.dt = 1.0 / 120.0;
    p.num_solver_iterations = 8;
    p.length_unit = 100.0;
    p.normalized_allowed_linear_error = 0.001 / 100.0;
    p.normalized_prediction_distance = 0.005 / 100.0;
    let body = world.bodies.insert(
        RigidBodyBuilder::dynamic()
            .can_sleep(false)
            .ccd_enabled(true),
    );
    CRAFT.with(|s| {
        *s.borrow_mut() = Some(Craft {
            world,
            body,
            shapes: Vec::new(),
            ticks: 0,
        })
    });
}
/// kind 0 cuboid (half extents), 1 ball (radius x, y/z ignored but finite).
#[unsafe(no_mangle)]
pub extern "C" fn craft_shape(
    kind: f64,
    x: f64,
    y: f64,
    z: f64,
    px: f64,
    py: f64,
    pz: f64,
    qx: f64,
    qy: f64,
    qz: f64,
    qw: f64,
    mass: f64,
    friction: f64,
) -> u32 {
    if ![kind, x, y, z, px, py, pz, qx, qy, qz, qw, mass, friction]
        .iter()
        .all(|v| v.is_finite())
        || (kind != 0.0 && kind != 1.0)
        || x <= 0.0
        || x > 10000.0
        || (kind == 0.0 && (y <= 0.0 || z <= 0.0 || y > 10000.0 || z > 10000.0))
        || [px, py, pz].iter().any(|v| v.abs() > 10000.0)
        || mass < 0.0
        || mass > 1e9
        || !(0.0..=10.0).contains(&friction)
        || (qx * qx + qy * qy + qz * qz + qw * qw - 1.0).abs() > 0.0001
    {
        return 0;
    }
    CRAFT.with(|s| {
        let mut state = s.borrow_mut();
        let Some(c) = state.as_mut() else {
            return 0;
        };
        if c.ticks != 0 || c.shapes.len() >= 3200 {
            return 0;
        }
        let shape = if kind == 0.0 {
            ColliderBuilder::cuboid(x as f32, y as f32, z as f32)
        } else {
            ColliderBuilder::ball(x as f32)
        };
        let mut col = shape
            .translation(Vector::new(px as f32, py as f32, pz as f32))
            .mass(mass as f32)
            .friction(friction as f32)
            .restitution(0.0)
            .build();
        col.set_rotation(Rotation::from_xyzw(
            qx as f32, qy as f32, qz as f32, qw as f32,
        ));
        let handle = c
            .world
            .colliders
            .insert_with_parent(col, c.body, &mut c.world.bodies);
        c.shapes.push(handle);
        1
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn craft_mass(index: u32, mass: f64) -> u32 {
    if !mass.is_finite() || mass < 0.0 || mass > 1e9 {
        return 0;
    }
    CRAFT.with(|s| {
        let mut state = s.borrow_mut();
        let Some(c) = state.as_mut() else {
            return 0;
        };
        let Some(h) = c.shapes.get(index as usize) else {
            return 0;
        };
        c.world.colliders[*h].set_mass(mass as f32);
        1
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn craft_step(fx: f64, fy: f64, fz: f64, px: f64, py: f64, pz: f64) -> u32 {
    if ![fx, fy, fz, px, py, pz]
        .iter()
        .all(|v| v.is_finite() && v.abs() <= 1e9)
    {
        return 0;
    }
    CRAFT.with(|s| {
        let mut state = s.borrow_mut();
        let Some(c) = state.as_mut() else {
            return 0;
        };
        if c.shapes.is_empty() || c.ticks >= 7200 {
            return 0;
        }
        let b = &mut c.world.bodies[c.body];
        b.recompute_mass_properties_from_colliders(&c.world.colliders);
        if b.mass() <= 0.0 {
            return 0;
        }
        b.reset_forces(true);
        b.reset_torques(true);
        b.add_force_at_point(
            Vector::new(fx as f32, fy as f32, fz as f32),
            Vector::new(px as f32, py as f32, pz as f32),
            true,
        );
        c.world.step();
        c.ticks += 1;
        1
    })
}
/// xyz, velocity xyz, quaternion xyzw, omega xyz, mass, local COM xyz, ticks, shape count.
#[unsafe(no_mangle)]
pub extern "C" fn craft_read(index: u32) -> f64 {
    CRAFT.with(|s| {
        let mut state = s.borrow_mut();
        let Some(c) = state.as_mut() else {
            return f64::NAN;
        };
        let b = &mut c.world.bodies[c.body];
        b.recompute_mass_properties_from_colliders(&c.world.colliders);
        let p = b.translation();
        let v = b.linvel();
        let q = b.rotation();
        let w = b.angvel();
        let com = b.local_center_of_mass();
        let values = [
            p.x,
            p.y,
            p.z,
            v.x,
            v.y,
            v.z,
            q.x,
            q.y,
            q.z,
            q.w,
            w.x,
            w.y,
            w.z,
            b.mass(),
            com.x,
            com.y,
            com.z,
            c.ticks as f32,
            c.shapes.len() as f32,
        ];
        values.get(index as usize).map_or(f64::NAN, |v| *v as f64)
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn craft_dispose() {
    CRAFT.with(|s| *s.borrow_mut() = None);
}

//! The Rapier world of one vessel: its rigid body, part colliders and the static ground box.
//! src/physics.ts drives it, one Wasm instance per vessel.
use rapier3d::prelude::*;
use std::cell::RefCell;
struct Craft {
    world: PhysicsWorld,
    body: RigidBodyHandle,
    shapes: Vec<ColliderHandle>,
    ground: Option<ColliderHandle>,
    ticks: u32,
    /// Collider masses or shapes changed since the body's mass properties were last computed.
    dirty: bool,
}
impl Craft {
    /// Recompute the body's mass properties only when colliders changed. The result depends only
    /// on the colliders, so skipping an unchanged recompute is exact; doing it on every call
    /// dominated the step time (several symmetric eigen decompositions per tick).
    fn refresh_mass(&mut self) {
        if self.dirty {
            self.world.bodies[self.body]
                .recompute_mass_properties_from_colliders(&self.world.colliders);
            self.dirty = false;
        }
    }
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
    // The game moves the ground collider and the vessel together through solver coordinates every
    // step (the surface of a rotating planet around a fixed origin). A recycled contact keeps the
    // ground-side anchor and the normal where the last full update put them in those coordinates
    // and is revalidated by the relative pose alone, so it would read that motion as penetration.
    // Determine the contacts from the current poses on every step instead.
    p.contact_recycling = false;
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
            ground: None,
            ticks: 0,
            dirty: true,
        })
    });
}

/// Existing Flight ground geometry: a 2000 x 1 x 2000 half-extent box.
/// Call before adding craft shapes to preserve the reference insertion order.
#[unsafe(no_mangle)]
pub extern "C" fn craft_ground(
    enabled: f64,
    px: f64,
    py: f64,
    pz: f64,
    qx: f64,
    qy: f64,
    qz: f64,
    qw: f64,
    friction: f64,
) -> u32 {
    if ![enabled, px, py, pz, qx, qy, qz, qw, friction]
        .iter()
        .all(|v| v.is_finite())
        || (enabled != 0.0 && enabled != 1.0)
        || [px, py, pz].iter().any(|v| v.abs() > 1e9)
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
        let handle = if let Some(h) = c.ground {
            h
        } else {
            if !c.shapes.is_empty() || c.ticks != 0 {
                return 0;
            }
            let h = c
                .world
                .colliders
                .insert(ColliderBuilder::cuboid(2000.0, 1.0, 2000.0));
            c.ground = Some(h);
            h
        };
        let g = &mut c.world.colliders[handle];
        g.set_enabled(enabled == 1.0);
        g.set_translation(Vector::new(px as f32, py as f32, pz as f32));
        g.set_rotation(Rotation::from_xyzw(
            qx as f32, qy as f32, qz as f32, qw as f32,
        ));
        g.set_friction(friction as f32);
        1
    })
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
        if c.shapes.len() >= 3200 {
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
        c.dirty = true;
        1
    })
}
/// Mirror Flight.buildColliders without resetting the body or solver clock.
#[unsafe(no_mangle)]
pub extern "C" fn craft_clear_shapes() -> u32 {
    CRAFT.with(|s| {
        let mut state = s.borrow_mut();
        let Some(c) = state.as_mut() else {
            return 0;
        };
        for h in c.shapes.drain(..) {
            c.world.colliders.remove(
                h,
                &mut c.world.islands,
                &mut c.world.bodies,
                &mut c.world.soft_bodies,
                true,
            );
        }
        c.world.bodies[c.body].recompute_mass_properties_from_colliders(&c.world.colliders);
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
        c.dirty = true;
        1
    })
}
/// Diagnostic: one fixed 120 Hz step under a single force at a point (tools/golden/craft-kernel.mjs).
#[cfg(feature = "diagnostics")]
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
        c.refresh_mass();
        let b = &mut c.world.bodies[c.body];
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
/// Diagnostic: xyz, velocity xyz, quaternion xyzw, omega xyz, mass, local COM xyz, ticks, shape count.
#[cfg(feature = "diagnostics")]
#[unsafe(no_mangle)]
pub extern "C" fn craft_read(index: u32) -> f64 {
    CRAFT.with(|s| {
        let mut state = s.borrow_mut();
        let Some(c) = state.as_mut() else {
            return f64::NAN;
        };
        c.refresh_mass();
        let b = &mut c.world.bodies[c.body];
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
/// Ground contact points of one craft shape, matching JS contactPair/numContacts over all manifolds.
/// Returns 0 without ground or contact, NaN for a missing shape.
#[unsafe(no_mangle)]
pub extern "C" fn craft_contact_count(index: u32) -> f64 {
    with_ground_contact(index, |impulses| impulses.count() as f64)
}
/// Normal impulse of the point-th ground contact point of a shape, in the order counted above.
#[unsafe(no_mangle)]
pub extern "C" fn craft_contact_impulse(index: u32, point: u32) -> f64 {
    with_ground_contact(index, |impulses| {
        impulses.nth(point as usize).map_or(f64::NAN, f64::from)
    })
}
/// 1 when any craft shape has a ground contact point with a positive normal impulse: the same
/// points, read the same way, as craft_contact_count/craft_contact_impulse over every shape.
#[unsafe(no_mangle)]
pub extern "C" fn craft_ground_support() -> u32 {
    CRAFT.with(|s| {
        let state = s.borrow();
        let Some(c) = state.as_ref() else {
            return 0;
        };
        let supported = c
            .shapes
            .iter()
            .any(|shape| ground_impulses(c, *shape).any(|impulse| impulse > 0.0));
        u32::from(supported)
    })
}
/// Normal impulses of the contact points between a shape and the ground, manifold by manifold.
fn ground_impulses(c: &Craft, shape: ColliderHandle) -> impl Iterator<Item = f32> + '_ {
    c.ground
        .and_then(|g| c.world.narrow_phase.contact_pair(shape, g))
        .into_iter()
        .flat_map(|pair| pair.manifolds())
        .flat_map(|m| m.points.iter().map(|p| p.data.impulse))
}
fn with_ground_contact(index: u32, f: impl FnOnce(&mut dyn Iterator<Item = f32>) -> f64) -> f64 {
    CRAFT.with(|s| {
        let state = s.borrow();
        let Some(c) = state.as_ref() else {
            return f64::NAN;
        };
        let Some(shape) = c.shapes.get(index as usize) else {
            return f64::NAN;
        };
        f(&mut ground_impulses(c, *shape))
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn craft_dispose() {
    CRAFT.with(|s| *s.borrow_mut() = None);
}

// Body and collider access for the game's physics facade (src/physics.ts). Each call is the same
// Rapier method that the rapier.js 0.21 binding calls for the JS method of the same name, so the
// facade reproduces JS Rapier's f32 storage, normalization and mass properties exactly.
fn with_body(f: impl FnOnce(&mut Craft) -> u32) -> u32 {
    CRAFT.with(|s| s.borrow_mut().as_mut().map_or(0, f))
}
fn finite(values: &[f64]) -> bool {
    values.iter().all(|v| v.is_finite() && v.abs() <= 1e9)
}
/// rbSetTranslation.
#[unsafe(no_mangle)]
pub extern "C" fn body_set_translation(x: f64, y: f64, z: f64) -> u32 {
    if !finite(&[x, y, z]) {
        return 0;
    }
    with_body(|c| {
        c.world.bodies[c.body].set_translation(Vector::new(x as f32, y as f32, z as f32), true);
        1
    })
}
/// rbSetRotation: ignored for a zero quaternion, otherwise normalized in f32.
#[unsafe(no_mangle)]
pub extern "C" fn body_set_rotation(x: f64, y: f64, z: f64, w: f64) -> u32 {
    if !finite(&[x, y, z, w]) {
        return 0;
    }
    with_body(|c| {
        let q = Rotation::from_xyzw(x as f32, y as f32, z as f32, w as f32);
        if q.length_squared() > 0.0 {
            c.world.bodies[c.body].set_rotation(q.normalize(), true);
        }
        1
    })
}
/// rbSetLinvel (kind 0) / rbSetAngvel (kind 1).
#[unsafe(no_mangle)]
pub extern "C" fn body_set_velocity(kind: u32, x: f64, y: f64, z: f64) -> u32 {
    if !finite(&[x, y, z]) || kind > 1 {
        return 0;
    }
    with_body(|c| {
        let v = Vector::new(x as f32, y as f32, z as f32);
        let b = &mut c.world.bodies[c.body];
        if kind == 0 {
            b.set_linvel(v, true);
        } else {
            b.set_angvel(v, true);
        }
        1
    })
}
/// rbResetForces + rbResetTorques.
#[unsafe(no_mangle)]
pub extern "C" fn body_reset_forces() -> u32 {
    with_body(|c| {
        let b = &mut c.world.bodies[c.body];
        b.reset_forces(true);
        b.reset_torques(true);
        1
    })
}
/// rbAddForceAtPoint (world-space force and point).
#[unsafe(no_mangle)]
pub extern "C" fn body_add_force_at_point(
    fx: f64,
    fy: f64,
    fz: f64,
    px: f64,
    py: f64,
    pz: f64,
) -> u32 {
    if !finite(&[fx, fy, fz, px, py, pz]) {
        return 0;
    }
    with_body(|c| {
        c.world.bodies[c.body].add_force_at_point(
            Vector::new(fx as f32, fy as f32, fz as f32),
            Vector::new(px as f32, py as f32, pz as f32),
            true,
        );
        1
    })
}
/// rbAddTorque.
#[unsafe(no_mangle)]
pub extern "C" fn body_add_torque(x: f64, y: f64, z: f64) -> u32 {
    if !finite(&[x, y, z]) {
        return 0;
    }
    with_body(|c| {
        c.world.bodies[c.body].add_torque(Vector::new(x as f32, y as f32, z as f32), true);
        1
    })
}
/// rbRecomputeMassPropertiesFromColliders. Skipping when no collider changed is exact: the local
/// properties depend only on the colliders, and the pose setters already update the world ones.
#[unsafe(no_mangle)]
pub extern "C" fn body_recompute_mass() -> u32 {
    with_body(|c| {
        c.refresh_mass();
        1
    })
}
/// Reads without side effects: translation xyz 0-2, linvel 3-5, rotation xyzw 6-9, angvel 10-12,
/// mass 13, local COM 14-16, world COM 17-19, principal inertia 20-22, principal inertia local
/// frame xyzw 23-26, user force 27-29, user torque 30-32.
#[unsafe(no_mangle)]
pub extern "C" fn body_get(field: u32) -> f64 {
    CRAFT.with(|s| {
        let state = s.borrow();
        let Some(c) = state.as_ref() else {
            return f64::NAN;
        };
        let b = &c.world.bodies[c.body];
        let m = &b.mass_properties().local_mprops;
        let (p, v, q, w) = (b.translation(), b.linvel(), b.rotation(), b.angvel());
        let (lc, wc, pi, pf) = (
            m.local_com,
            b.center_of_mass(),
            m.principal_inertia(),
            m.principal_inertia_local_frame,
        );
        let (f, t) = (b.user_force(), b.user_torque());
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
            lc.x,
            lc.y,
            lc.z,
            wc.x,
            wc.y,
            wc.z,
            pi.x,
            pi.y,
            pi.z,
            pf.x,
            pf.y,
            pf.z,
            pf.w,
            f.x,
            f.y,
            f.z,
            t.x,
            t.y,
            t.z,
        ];
        values.get(field as usize).map_or(f64::NAN, |v| *v as f64)
    })
}
/// Pose of the static ground (coSetEnabled, coSetTranslation, coSetRotation normalized like the
/// binding, coSetFriction). Created on first use, before any craft shape.
#[unsafe(no_mangle)]
pub extern "C" fn ground_set(
    enabled: f64,
    px: f64,
    py: f64,
    pz: f64,
    qx: f64,
    qy: f64,
    qz: f64,
    qw: f64,
    friction: f64,
) -> u32 {
    let q = Rotation::from_xyzw(qx as f32, qy as f32, qz as f32, qw as f32);
    if !finite(&[qx, qy, qz, qw]) || q.length_squared() == 0.0 {
        return 0;
    }
    let q = q.normalize();
    craft_ground(
        enabled, px, py, pz, q.x as f64, q.y as f64, q.z as f64, q.w as f64, friction,
    )
}
/// Stored collider values: kind 0 cuboid / 1 ball 0, half extents (or radius) 1-3, translation
/// wrt parent 4-6, rotation wrt parent xyzw 7-10, mass 11, friction 12. Index -1 is the ground.
#[unsafe(no_mangle)]
pub extern "C" fn shape_get(index: i32, field: u32) -> f64 {
    CRAFT.with(|s| {
        let state = s.borrow();
        let Some(c) = state.as_ref() else {
            return f64::NAN;
        };
        let handle = if index < 0 {
            c.ground
        } else {
            c.shapes.get(index as usize).copied()
        };
        let Some(h) = handle else {
            return f64::NAN;
        };
        let co = &c.world.colliders[h];
        let (kind, e) = if let Some(b) = co.shape().as_ball() {
            (1.0, Vector::new(b.radius, b.radius, b.radius))
        } else if let Some(b) = co.shape().as_cuboid() {
            (0.0, b.half_extents)
        } else {
            return f64::NAN;
        };
        let pose = co.position_wrt_parent().copied().unwrap_or(*co.position());
        let (t, q) = (pose.translation, pose.rotation);
        let values = [
            kind,
            e.x,
            e.y,
            e.z,
            t.x,
            t.y,
            t.z,
            q.x,
            q.y,
            q.z,
            q.w,
            co.mass(),
            co.friction(),
        ];
        values.get(field as usize).map_or(f64::NAN, |v| *v as f64)
    })
}
/// Steps with the forces already accumulated on the body. No tick cap: the game steps for whole
/// flights.
#[unsafe(no_mangle)]
pub extern "C" fn world_step(
    gx: f64,
    gy: f64,
    gz: f64,
    dt: f64,
    scale: f64,
    error: f64,
    prediction: f64,
) -> u32 {
    if !finite(&[gx, gy, gz, dt, scale, error, prediction])
        || dt <= 0.0
        || dt > 10000.0
        || !(1.0..=100.0).contains(&scale)
        || error < 0.0
        || prediction < 0.0
    {
        return 0;
    }
    with_body(|c| {
        if c.shapes.is_empty() {
            return 0;
        }
        c.refresh_mass();
        if c.world.bodies[c.body].mass() <= 0.0 {
            return 0;
        }
        c.world.gravity = Vector::new(gx as f32, gy as f32, gz as f32);
        let p = &mut c.world.integration_parameters;
        p.dt = dt as f32;
        p.length_unit = scale as f32;
        p.normalized_allowed_linear_error = error as f32;
        p.normalized_prediction_distance = prediction as f32;
        c.world.step();
        c.ticks = c.ticks.saturating_add(1);
        1
    })
}

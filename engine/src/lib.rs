//! Migration diagnostic kernel. Not yet the authoritative game simulation.
use rapier3d::prelude::*;

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

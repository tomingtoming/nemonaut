use std::cell::Cell;

thread_local! {static OUTPUT: Cell<[f64;7]> = const {Cell::new([0.0;7])};}

type V = [f64; 3];
fn add(a: V, b: V) -> V {
    std::array::from_fn(|i| a[i] + b[i])
}
fn sub(a: V, b: V) -> V {
    std::array::from_fn(|i| a[i] - b[i])
}
fn scaled(a: V, k: f64) -> V {
    a.map(|x| x * k)
}
fn norm_sq(a: V) -> f64 {
    a[0] * a[0] + a[1] * a[1] + a[2] * a[2]
}
fn gravity(r: V, mu: f64) -> V {
    scaled(r, -mu / norm_sq(r).sqrt().max(1.0).powi(3))
}

// Both ephemerides come from the game's world definition. The starting body governs the full step.
#[unsafe(no_mangle)]
pub extern "C" fn advance(
    px: f64,
    py: f64,
    pz: f64,
    vx: f64,
    vy: f64,
    vz: f64,
    ax: f64,
    ay: f64,
    az: f64,
    dt: f64,
    center_y: f64,
    primary_mu: f64,
    moon_mu: f64,
    soi: f64,
    start_y: f64,
    start_z: f64,
    start_vy: f64,
    start_vz: f64,
    end_y: f64,
    end_z: f64,
    end_vy: f64,
    end_vz: f64,
) -> usize {
    let p = [px, py, pz];
    let v = [vx, vy, vz];
    let a = [ax, ay, az];
    let start = [0., start_y, start_z];
    let end = [0., end_y, end_z];
    let center = [0., center_y, 0.];
    let (r, local_v, mu, end_p, end_v) = if norm_sq(sub(p, start)) < soi * soi {
        (
            sub(p, start),
            sub(v, [0., start_vy, start_vz]),
            moon_mu,
            end,
            [0., end_vy, end_vz],
        )
    } else {
        (sub(p, center), v, primary_mu, center, [0.; 3])
    };
    let half = add(local_v, scaled(add(gravity(r, mu), a), dt / 2.));
    let next = add(r, scaled(half, dt));
    let velocity = add(add(half, scaled(add(gravity(next, mu), a), dt / 2.)), end_v);
    let position = add(next, end_p);
    let moon = norm_sq(sub(position, end)) < soi * soi;
    OUTPUT.with(|out| {
        out.set([
            position[0],
            position[1],
            position[2],
            velocity[0],
            velocity[1],
            velocity[2],
            if moon { 1. } else { 0. },
        ]);
        out.as_ptr() as usize
    })
}

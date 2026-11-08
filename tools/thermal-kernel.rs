// Standalone thermal migration experiment. The JS adapter registers vessel-frame geometry.
use std::cell::RefCell;
type V = [f64; 3];
fn dot(a: V, b: V) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

#[repr(C)]
#[derive(Clone, Default)]
struct Part {
    corners: [V; 8],
    area_axes: [V; 3],
    face: V,
    normal: V,
    shield_radius: f64,
    surface: f64,
    capacity: f64,
    emissivity: f64,
    nose_radius: f64,
    limit: f64,
    ablation_temp: f64,
    ablation_energy: f64,
}
#[repr(C)]
#[derive(Clone, Default)]
struct State {
    temp: f64,
    mass: f64,
    failed: f64,
    covered: f64,
    flux: f64,
    heat: f64,
    loss: f64,
    burned: f64,
}
thread_local! {
    static PARTS:RefCell<Vec<Part>>=const{RefCell::new(Vec::new())};
    static STATES:RefCell<Vec<State>>=const{RefCell::new(Vec::new())};
}
#[unsafe(no_mangle)]
pub extern "C" fn register(count: usize) -> usize {
    STATES.with_borrow_mut(|s| s.resize(count, State::default()));
    PARTS.with_borrow_mut(|p| {
        p.resize(count, Part::default());
        p.as_mut_ptr() as usize
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn states() -> usize {
    STATES.with_borrow_mut(|s| s.as_mut_ptr() as usize)
}

fn covers(shield: &Part, part: &Part, dir: V) -> bool {
    let incidence = dot(shield.normal, dir);
    if incidence < 0.5 {
        return false;
    }
    part.corners.iter().all(|corner| {
        let delta: V = std::array::from_fn(|i| shield.face[i] - corner[i]);
        let distance = dot(delta, shield.normal) / incidence;
        let offset: V = std::array::from_fn(|i| dir[i] * distance - delta[i]);
        distance >= 0.0 && dot(offset, offset) <= shield.shield_radius * shield.shield_radius
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn step(x: f64, y: f64, z: f64, speed: f64, rho: f64, air: f64, dt: f64) {
    let dir = [x, y, z];
    let ambient = if rho > 1e-9 { air } else { 3.0 };
    let count = (dt / 0.05).ceil() as usize;
    let h = dt / count as f64;
    PARTS.with_borrow(|parts| {
        STATES.with_borrow_mut(|states| {
            // Shield failures take effect on the next tick, independent of part ordering.
            let shields: Vec<_> = parts
                .iter()
                .enumerate()
                .filter(|(i, p)| p.shield_radius > 0.0 && states[*i].failed == 0.0)
                .collect();
            for (i, (p, s)) in parts.iter().zip(states.iter_mut()).enumerate() {
                let covered = shields
                    .iter()
                    .any(|(j, shield)| *j != i && covers(shield, p, dir));
                s.covered = if covered { 1.0 } else { 0.0 };
                let area: f64 = p.area_axes.iter().map(|axis| dot(*axis, dir).abs()).sum();
                s.flux = 1.74e-4 * (rho.max(0.0) / p.nose_radius.max(0.05)).sqrt() * speed.powi(3);
                let power = s.flux * area * if covered { 0.025 } else { 1.0 };
                let ablative = p.shield_radius > 0.0 && dot(dir, p.normal) > 0.5;
                s.heat = 0.0;
                s.loss = 0.0;
                s.burned = 0.0;
                for _ in 0..count {
                    let heat =
                        power * (1.0 - (s.temp - air) / (speed * speed / 2010.0).max(1.0)).max(0.0);
                    let loss = p.emissivity
                        * 5.670374419e-8
                        * p.surface
                        * (s.temp.powi(4) - ambient.powi(4))
                        + rho * 10.0 * p.surface * (s.temp - air);
                    let mut energy = (heat - loss) * h;
                    if ablative && s.mass > 0.0 && energy > 0.0 {
                        let sensible = (p.ablation_temp - s.temp).max(0.0) * p.capacity;
                        let burn = s.mass.min((energy - sensible).max(0.0) / p.ablation_energy);
                        s.mass -= burn;
                        s.burned += burn;
                        energy -= burn * p.ablation_energy;
                    }
                    s.temp = (s.temp + energy / p.capacity).max(ambient.min(s.temp));
                    if s.temp > p.limit {
                        s.failed = 1.0;
                    }
                    s.heat += heat * h;
                    s.loss += loss * h;
                }
                s.heat /= dt;
                s.loss /= dt;
            }
        })
    });
}

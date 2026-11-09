//! Standalone shape-resident drag prototype. Each instance represents one geometry.
use std::cell::RefCell;

type Vec3 = [f64; 3];
type BoxRow = [f64; 17]; // center, half sizes, three local unit axes, disc flag, nose flag

#[derive(Default)]
struct Model {
    boxes: Vec<BoxRow>,
    projected: Vec<Vec3>,
    last: Option<(Vec3, f64)>,
}

thread_local! {
    static MODEL: RefCell<Model> = RefCell::new(Model::default());
}

fn dot(a: Vec3, b: Vec3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn local_axis(b: &BoxRow, axis: usize) -> Vec3 {
    let start = 6 + 3 * axis;
    [b[start], b[start + 1], b[start + 2]]
}

fn blocks(b: &BoxRow, projected: Vec3, start: Vec3) -> bool {
    let offset = std::array::from_fn(|i| start[i] - b[i]);
    let mut near = 0.0_f64;
    let mut far = f64::INFINITY;
    for axis in 0..3 {
        let origin = dot(offset, local_axis(b, axis));
        let half = b[3 + axis];
        let direction = projected[axis];
        if direction.abs() < 1e-10 {
            if origin.abs() > half + 1e-8 {
                return false;
            }
        } else {
            let a = (-half - origin) / direction;
            let z = (half - origin) / direction;
            near = near.max(a.min(z));
            far = far.min(a.max(z));
            if far < near {
                return false;
            }
        }
    }
    true
}

impl Model {
    fn area(&mut self, direction: Vec3) -> f64 {
        let length_sq = dot(direction, direction);
        if length_sq < 1e-12 {
            return 0.0;
        }
        let wind = direction.map(|x| x * length_sq.sqrt().recip());
        if let Some((last, area)) = self.last {
            let delta = std::array::from_fn(|i| wind[i] - last[i]);
            if dot(delta, delta) < 1e-6 {
                return area;
            }
        }
        for (b, projected) in self.boxes.iter().zip(&mut self.projected) {
            *projected = std::array::from_fn(|i| dot(wind, local_axis(b, i)));
        }
        let mut area = 0.0;
        for (index, b) in self.boxes.iter().enumerate() {
            for axis in 0..3 {
                let incident = self.projected[index][axis];
                if incident.abs() < 1e-6 {
                    continue;
                }
                let u = (axis + 1) % 3;
                let v = (axis + 2) % 3;
                let mut exposed = 0;
                for i in 0..4 {
                    for j in 0..4 {
                        let mut local = [0.0; 3];
                        local[axis] = incident.signum() * b[3 + axis];
                        local[u] = b[3 + u] * ((i as f64 + 0.5) / 2.0 - 1.0);
                        local[v] = b[3 + v] * ((j as f64 + 0.5) / 2.0 - 1.0);
                        let start = std::array::from_fn(|k| {
                            b[k] + (local[0] * b[6 + k]
                                + local[1] * b[9 + k]
                                + local[2] * b[12 + k])
                                + wind[k] * 1e-7
                        });
                        if !self
                            .boxes
                            .iter()
                            .enumerate()
                            .any(|(n, other)| n != index && blocks(other, self.projected[n], start))
                        {
                            exposed += 1;
                        }
                    }
                }
                let coefficient = if axis == 1 && b[15] != 0.0 {
                    std::f64::consts::FRAC_PI_4 * 1.1
                } else if axis == 1 && b[16] != 0.0 && incident > 0.0 {
                    0.15
                } else {
                    0.4
                };
                area += 4.0 * b[3 + u] * b[3 + v] * incident.abs() * exposed as f64 / 16.0
                    * coefficient;
            }
        }
        self.last = Some((wind, area));
        area
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn drag_prepare(count: usize) -> *mut f64 {
    MODEL.with_borrow_mut(|model| {
        model.last = None;
        model.boxes.resize(count, [0.0; 17]);
        model.projected.resize(count, [0.0; 3]);
        model.boxes.as_mut_ptr().cast()
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn drag_area(x: f64, y: f64, z: f64) -> f64 {
    MODEL.with_borrow_mut(|model| model.area([x, y, z]))
}

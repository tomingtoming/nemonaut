//! Vessel-vessel contact query. Two craft collider sets (side 0 and 1) are posed in a shared
//! local frame chosen by the caller near the contact, so f32 stays precise. Query only: no world
//! is stepped here and the game resolves the impulses.
use rapier3d::parry::bounding_volume::BoundingVolume;
use rapier3d::parry::math::Pose;
use rapier3d::parry::query::contact;
use rapier3d::parry::shape::{Ball, Cuboid, Shape};
use rapier3d::prelude::*;
use std::cell::RefCell;

struct PairShape {
    shape: Box<dyn Shape>,
    local: Pose,
}
#[derive(Default)]
struct Pair {
    sides: [Vec<PairShape>; 2],
    pose: [Pose; 2],
    /// point xyz (midway between surfaces), normal xyz (from side 0 toward side 1),
    /// signed distance (negative when penetrating), shape index on side 0, on side 1.
    contacts: Vec<[f32; 9]>,
}
thread_local! { static PAIR: RefCell<Pair> = RefCell::new(Pair::default()); }

fn finite(values: &[f64], limit: f64) -> bool {
    values.iter().all(|v| v.is_finite() && v.abs() <= limit)
}
fn pose(px: f64, py: f64, pz: f64, qx: f64, qy: f64, qz: f64, qw: f64) -> Option<Pose> {
    if !finite(&[px, py, pz], 1e6)
        || !finite(&[qx, qy, qz, qw], 2.0)
        || (qx * qx + qy * qy + qz * qz + qw * qw - 1.0).abs() > 0.0001
    {
        return None;
    }
    Some(Pose::from_parts(
        Vector::new(px as f32, py as f32, pz as f32),
        Rotation::from_xyzw(qx as f32, qy as f32, qz as f32, qw as f32),
    ))
}
#[unsafe(no_mangle)]
pub extern "C" fn pair_reset() {
    PAIR.with(|p| *p.borrow_mut() = Pair::default());
}
/// kind 0 cuboid (half extents xyz), 1 ball (radius x); local pose relative to the craft body.
#[unsafe(no_mangle)]
pub extern "C" fn pair_shape(
    side: u32,
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
) -> u32 {
    if side > 1
        || (kind != 0.0 && kind != 1.0)
        || !finite(&[x, y, z], 10000.0)
        || x <= 0.0
        || (kind == 0.0 && (y <= 0.0 || z <= 0.0))
        || !finite(&[px, py, pz], 10000.0)
    {
        return 0;
    }
    let Some(local) = pose(px, py, pz, qx, qy, qz, qw) else {
        return 0;
    };
    let shape: Box<dyn Shape> = if kind == 0.0 {
        Box::new(Cuboid::new(Vector::new(x as f32, y as f32, z as f32)))
    } else {
        Box::new(Ball::new(x as f32))
    };
    PAIR.with(|p| {
        let mut p = p.borrow_mut();
        if p.sides[side as usize].len() >= 3200 {
            return 0;
        }
        p.sides[side as usize].push(PairShape { shape, local });
        1
    })
}
/// Body pose of one side in the shared local frame.
#[unsafe(no_mangle)]
pub extern "C" fn pair_pose(
    side: u32,
    px: f64,
    py: f64,
    pz: f64,
    qx: f64,
    qy: f64,
    qz: f64,
    qw: f64,
) -> u32 {
    let Some(value) = pose(px, py, pz, qx, qy, qz, qw) else {
        return 0;
    };
    if side > 1 {
        return 0;
    }
    PAIR.with(|p| p.borrow_mut().pose[side as usize] = value);
    1
}
/// Finds every shape pair closer than `prediction` meters. Returns the contact count,
/// or NaN for invalid input or an unsupported shape pair.
#[unsafe(no_mangle)]
pub extern "C" fn pair_query(prediction: f64) -> f64 {
    if !prediction.is_finite() || !(0.0..=10.0).contains(&prediction) {
        return f64::NAN;
    }
    PAIR.with(|p| {
        let mut p = p.borrow_mut();
        let p = &mut *p;
        p.contacts.clear();
        let place = |side: usize, s: &PairShape| p.pose[side] * s.local;
        let boxes: [Vec<_>; 2] = [0, 1].map(|side| {
            p.sides[side]
                .iter()
                .map(|s| {
                    s.shape
                        .compute_aabb(&place(side, s))
                        .loosened(prediction as f32)
                })
                .collect()
        });
        for (i, a) in p.sides[0].iter().enumerate() {
            for (j, b) in p.sides[1].iter().enumerate() {
                if !boxes[0][i].intersects(&boxes[1][j]) {
                    continue;
                }
                let (pa, pb) = (place(0, a), place(1, b));
                match contact(&pa, &*a.shape, &pb, &*b.shape, prediction as f32) {
                    Ok(Some(c)) => {
                        let m = (c.point1 + c.point2) * 0.5;
                        let n = c.normal1;
                        p.contacts
                            .push([m.x, m.y, m.z, n.x, n.y, n.z, c.dist, i as f32, j as f32]);
                    }
                    Ok(None) => {}
                    Err(_) => return f64::NAN,
                }
            }
        }
        p.contacts.len() as f64
    })
}
/// field 0-2 point, 3-5 normal (side 0 toward 1), 6 signed distance, 7 shape on side 0, 8 on side 1.
#[unsafe(no_mangle)]
pub extern "C" fn pair_read(index: u32, field: u32) -> f64 {
    PAIR.with(|p| {
        p.borrow()
            .contacts
            .get(index as usize)
            .and_then(|c| c.get(field as usize))
            .map_or(f64::NAN, |v| *v as f64)
    })
}

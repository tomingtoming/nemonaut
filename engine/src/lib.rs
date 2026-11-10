//! The game's physics and flight numerics, compiled to src/engine/orbital_engine.wasm and loaded by
//! src/physics.ts. `craft` is the Rapier world of one vessel; the other modules are the batched
//! per-step calculations. The `diagnostics` feature adds exports that only the parity tools call.
mod body_drag;
mod celestial;
mod charge;
mod coast_cooling;
mod craft;
mod fuel;
mod kepler;
#[cfg(feature = "diagnostics")]
mod kernel;
mod pair;
mod thermal;
mod water;
mod wing;

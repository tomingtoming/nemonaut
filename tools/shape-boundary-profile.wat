;; Profiling adapter only. Calls the actual per-vessel Rust shape_get export directly
;; from Wasm; the Rapier world remains the sole owner of collider geometry.
(module
  (import "engine" "shape_get" (func $get (param i32 i32) (result f64)))
  (memory (export "memory") 1)
  (func (export "read") (param $count i32)
    (local $index i32) (local $field i32) (local $dst i32)
    (block $done
      (loop $colliders
        (br_if $done (i32.ge_u (local.get $index) (local.get $count)))
        (local.set $field (i32.const 0))
        (loop $fields
          (f64.store (local.get $dst) (call $get (local.get $index) (local.get $field)))
          (local.set $dst (i32.add (local.get $dst) (i32.const 8)))
          (local.set $field (i32.add (local.get $field) (i32.const 1)))
          (br_if $fields (i32.le_u (local.get $field) (i32.const 6))))
        (local.set $index (i32.add (local.get $index) (i32.const 1)))
        (br $colliders)))))

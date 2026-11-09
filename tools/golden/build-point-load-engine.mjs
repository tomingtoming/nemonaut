// Build a diagnostic copy of the shipped engine, retaining its existing Rapier functions.
import {readFileSync, writeFileSync} from 'node:fs';
import wabtInit from '../../artifacts/point-load-tools/node_modules/wabt/index.js';
const wabt = await wabtInit();
const engine = wabt.readWasm(
  readFileSync(new URL('../../src/engine/orbital_engine.wasm', import.meta.url)),
  {}
);
try {
  const wat = engine.toText({});
  const force = wat.match(/\(export "body_add_force_at_point" \(func ([^()]+)\)\)/)?.[1];
  if (!force) throw Error('Missing scalar point-load export');
  // Use the existing water row allocator only on a craft World. Water simulation owns the
  // separate shared instance. The preload invalidates this view on any other water_prepare.
  const apply = `(func (export "point_load_apply") (param $p i32) (param $n i32) (result i32)
    (block $done (loop $next
      (br_if $done (i32.eqz (local.get $n)))
      (if (i32.eqz (call ${force}
        (f64.load (local.get $p)) (f64.load offset=8 (local.get $p))
        (f64.load offset=16 (local.get $p)) (f64.load offset=24 (local.get $p))
        (f64.load offset=32 (local.get $p)) (f64.load offset=40 (local.get $p))))
        (then (return (i32.const 0))))
      (local.set $p (i32.add (local.get $p) (i32.const 48)))
      (local.set $n (i32.sub (local.get $n) (i32.const 1)))
      (br $next)))
    (i32.const 1))`;
  const module = wabt.parseWat('point-load-engine.wat', wat.trimEnd().slice(0, -1) + apply + ')');
  try {
    module.validate();
    writeFileSync(
      new URL('../../artifacts/point-load-engine.wasm', import.meta.url),
      module.toBinary({}).buffer
    );
  } finally {
    module.destroy();
  }
} finally {
  engine.destroy();
}

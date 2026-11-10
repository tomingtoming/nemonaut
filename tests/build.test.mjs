import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, existsSync, statSync} from 'node:fs';
import path from 'node:path';
import {transform} from 'esbuild';

// npm test builds dist first (pretest); these check that what is served is what src says.
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const src = path.join(root, 'src'),
  dist = path.join(root, 'dist');
const walk = dir =>
  readdirSync(dir, {withFileTypes: true}).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
  );
// The module workers: an import map does not apply inside a worker, so each is bundled with its imports.
const WORKERS = ['landing-plan-worker.js', 'takeoff-forecast-worker.js'];

test('every source file is delivered unchanged, declarations are not', () => {
  for (const file of walk(src)) {
    const rel = path.relative(src, file);
    if (/\.d\.m?ts$/.test(rel)) {
      assert.equal(existsSync(path.join(dist, rel)), false, rel + ' must not ship');
      continue;
    }
    if (rel.endsWith('.ts')) {
      assert.ok(existsSync(path.join(dist, rel.slice(0, -3) + '.js')), rel + ' must be transformed');
      continue;
    }
    assert.ok(
      readFileSync(path.join(dist, rel)).equals(readFileSync(file)),
      rel + ' differs in dist: run npm run build'
    );
  }
});
test('each worker is one self-contained bundle built from its src module', () => {
  for (const name of WORKERS) {
    assert.ok(existsSync(path.join(src, name.slice(0, -3) + '.ts')), name + ' needs its source in src');
    assert.equal(existsSync(path.join(src, name)), false, name + ' is generated, not a source');
    assert.ok(statSync(path.join(dist, name)).size > 1000, name);
    const imports = [
      ...readFileSync(path.join(dist, name), 'utf8').matchAll(/^import\b.*?from\s*"([^"]+)"/gm)
    ];
    assert.ok(imports.length > 0, name + ' must import the vendored three.js');
    for (const [, specifier] of imports)
      assert.equal(specifier, './vendor/three/three.module.js', name + ' must not import ' + specifier);
  }
});
test('a .ts module becomes plain ES module JS with its import path unchanged', async () => {
  const {code} = await transform(
    "import {g} from './celestial.js';\nexport const lift=(v: number): number=>g*v;\n",
    {loader: 'ts', format: 'esm', target: 'es2022', charset: 'utf8'}
  );
  assert.match(code, /from "\.\/celestial\.js"/);
  assert.doesNotMatch(code, /: number/);
});

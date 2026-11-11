import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, existsSync, statSync} from 'node:fs';
import path from 'node:path';
import {transform} from 'esbuild';
// The module workers (WORKERS): an import map does not apply inside a worker, so each is bundled with its imports.
import {WORKERS, transformOptions} from '../tools/build.mjs';

// npm test builds dist first (pretest); these check that what is served is what src says.
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const src = path.join(root, 'src'),
  dist = path.join(root, 'dist');
const walk = dir =>
  readdirSync(dir, {withFileTypes: true}).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
  );

test('static files are delivered byte for byte, each .ts as the build transform of its source, declarations not at all', async () => {
  for (const file of walk(src)) {
    const rel = path.relative(src, file);
    if (/\.d\.m?ts$/.test(rel)) {
      assert.equal(existsSync(path.join(dist, rel)), false, rel + ' must not ship');
      continue;
    }
    if (rel.endsWith('.ts')) {
      const name = rel.slice(0, -3) + '.js';
      assert.ok(existsSync(path.join(dist, name)), rel + ' must be transformed');
      // The two workers are bundled over their transformed module afterwards.
      if (WORKERS.includes(name)) continue;
      const {code} = await transform(readFileSync(file, 'utf8'), transformOptions(rel));
      assert.equal(
        readFileSync(path.join(dist, name), 'utf8'),
        code,
        rel + ' differs in dist: run npm run build'
      );
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
test('a delivered .ts module is plain ES module JS with its import paths as written', async () => {
  const source = readFileSync(path.join(src, 'surface-frame.ts'), 'utf8'),
    code = readFileSync(path.join(dist, 'surface-frame.js'), 'utf8');
  assert.match(source, /\): T\.Quaternion \{/, 'the source has type annotations to strip');
  // Parsing as JavaScript fails on any TypeScript syntax that was left in.
  await transform(code, {loader: 'js', format: 'esm'});
  const written = [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm)].map(m => m[1]),
    delivered = [...code.matchAll(/^import\s[^;]*?from\s+"([^"]+)"/gm)].map(m => m[1]);
  assert.ok(written.some(s => s.startsWith('./') && s.endsWith('.js')));
  assert.deepEqual(delivered, written);
});

// Type precision gauge (BACKLOG 6). Counts, per src/*.ts, the claims the type checker cannot verify:
// non-null assertions (`x!`) and type assertions (`x as T`, except `as const`). The goal is zero,
// except for `as` in the boundary modules listed in tools/precision.json (where untyped data enters:
// the Wasm exports, parsed save JSON, DOM lookups), whose recorded counts may only go down.
// Everywhere else both counts must be zero (reached 2026-11-02, BACKLOG 6), so CI fails on any new claim.
// Usage: node tools/type-precision.mjs [--check] [--update] [--files a,b]
//   --check    exit 1 if a module has a `!`, a non-boundary module has an `as`, or a boundary module
//              exceeds its recorded `as` count
//   --update   lower the recorded counts to the current ones (never raises them)
import ts from 'typescript';
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const recordFile = path.join(root, 'tools', 'precision.json');

export function measure() {
  const files = new Map();
  for (const f of readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.ts'))) {
    const sf = ts.createSourceFile(
      f,
      readFileSync(path.join(root, 'src', f), 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    let nonNull = 0,
      as = 0;
    const visit = n => {
      if (n.kind === ts.SyntaxKind.NonNullExpression) nonNull++;
      if (
        ts.isAsExpression(n) &&
        !(ts.isTypeReferenceNode(n.type) && n.type.typeName.getText(sf) === 'const')
      )
        as++;
      if (n.kind === ts.SyntaxKind.TypeAssertionExpression) as++;
      ts.forEachChild(n, visit);
    };
    visit(sf);
    files.set(f.replace(/\.ts$/, ''), {nonNull, as});
  }
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const files = measure(),
    record = JSON.parse(readFileSync(recordFile, 'utf8'));
  const boundary = new Set(record.boundary),
    total = {files: files.size, nonNull: 0, as: 0, asOutsideBoundary: 0, clean: 0};
  const worse = [];
  for (const [name, f] of files) {
    total.nonNull += f.nonNull;
    total.as += f.as;
    if (!boundary.has(name)) total.asOutsideBoundary += f.as;
    if (f.nonNull === 0 && (f.as === 0 || boundary.has(name))) total.clean++;
    const allowed = boundary.has(name) ? (record.counts[name]?.as ?? 0) : 0;
    if (f.nonNull > 0 || f.as > allowed) worse.push({name, now: f, allowedAs: allowed});
  }
  console.log(JSON.stringify({...total, worse}));
  const only = process.argv.indexOf('--files');
  if (only > 0)
    for (const name of process.argv[only + 1].split(',')) {
      const f = files.get(name);
      console.log(
        f
          ? `${name}\tnonNull ${f.nonNull}\tas ${f.as}${boundary.has(name) ? ' (boundary)' : ''}`
          : `${name}\tmissing`
      );
    }
  if (process.argv.includes('--update')) {
    const counts = {};
    for (const [name, f] of [...files].sort(([a], [b]) => (a < b ? -1 : 1)))
      if (boundary.has(name)) {
        const was = record.counts[name];
        counts[name] = {nonNull: 0, as: was ? Math.min(was.as, f.as) : f.as};
      }
    writeFileSync(recordFile, JSON.stringify({...record, counts}, null, 1) + '\n');
  }
  if (process.argv.includes('--check') && worse.length) process.exitCode = 1;
}

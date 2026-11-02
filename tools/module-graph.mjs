// Module structure gauge (BACKLOG 7). Builds the runtime import graph of src/*.ts (value imports and
// re-exports; type-only imports are erased by the build and do not count) and reports import cycles
// (strongly connected components) and the size of app.ts, the composition root.
// tools/module-graph.json records the allowed cycles (may only shrink). app.ts, the composition root,
// must stay within the target size (BACKLOG 7 reached it on 2026-11-02).
// Usage: node tools/module-graph.mjs [--check] [--update] [--deps name]
//   --check   exit 1 on a cycle that is not recorded, or if app.ts is larger than the target
//   --update  record the current state (cycles only removed)
//   --deps n  print what module n imports and what imports it
import ts from 'typescript';
import {readFileSync, writeFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const recordFile = path.join(root, 'tools', 'module-graph.json');
const APP_TARGET = 15000;

export function graph() {
  const edges = new Map();
  for (const f of readdirSync(path.join(root, 'src')).filter(
    f => f.endsWith('.ts') && !f.endsWith('.d.ts')
  )) {
    const name = f.slice(0, -3),
      sf = ts.createSourceFile(
        f,
        readFileSync(path.join(root, 'src', f), 'utf8'),
        ts.ScriptTarget.Latest,
        false
      );
    const out = new Set();
    for (const st of sf.statements) {
      if (
        !(ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) ||
        !st.moduleSpecifier ||
        !ts.isStringLiteral(st.moduleSpecifier)
      )
        continue;
      const m = st.moduleSpecifier.text.match(/^\.\/([^/]+)\.js$/);
      if (!m) continue;
      if (ts.isImportDeclaration(st)) {
        const c = st.importClause;
        // A clause that only names types (import type, or every specifier marked type) is erased.
        if (
          c &&
          (c.isTypeOnly ||
            (!c.name &&
              c.namedBindings &&
              ts.isNamedImports(c.namedBindings) &&
              c.namedBindings.elements.length > 0 &&
              c.namedBindings.elements.every(e => e.isTypeOnly)))
        )
          continue;
      } else if (st.isTypeOnly) continue;
      out.add(m[1]);
    }
    edges.set(name, out);
  }
  return edges;
}
export function cycles(edges) {
  // Tarjan's strongly connected components; components with more than one module are cycles.
  let index = 0;
  const idx = new Map(),
    low = new Map(),
    stack = [],
    on = new Set(),
    result = [];
  const visit = v => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    on.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!edges.has(w)) continue;
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) result.push(comp.sort());
    }
  };
  for (const v of edges.keys()) if (!idx.has(v)) visit(v);
  return result.sort((a, b) => a.join().localeCompare(b.join()));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const edges = graph(),
    found = cycles(edges),
    appBytes = statSync(path.join(root, 'src', 'app.ts')).size;
  const record = JSON.parse(readFileSync(recordFile, 'utf8')),
    allowed = new Set(record.cycles.map(c => c.join(' ')));
  const newCycles = found.filter(c => !allowed.has(c.join(' ')));
  console.log(
    JSON.stringify({
      modules: edges.size,
      appBytes,
      target: APP_TARGET,
      cycles: found,
      newCycles
    })
  );
  const d = process.argv.indexOf('--deps');
  if (d > 0) {
    const n = process.argv[d + 1];
    console.log(n + ' imports: ' + [...(edges.get(n) ?? [])].sort().join(' '));
    console.log(
      'imported by: ' +
        [...edges]
          .filter(([, o]) => o.has(n))
          .map(([k]) => k)
          .sort()
          .join(' ')
    );
  }
  if (process.argv.includes('--update')) {
    writeFileSync(
      recordFile,
      JSON.stringify(
        {
          ...record,
          cycles: record.cycles.filter(c => found.some(f => f.join(' ') === c.join(' ')))
        },
        null,
        1
      ) + '\n'
    );
  }
  if (process.argv.includes('--check') && (newCycles.length || appBytes > APP_TARGET)) process.exitCode = 1;
}

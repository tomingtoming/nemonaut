// Type hardness check. tsconfig is `strict`, so tsc reports the type errors; this adds
// what tsc does not forbid: explicit `any` types and @ts-ignore / @ts-expect-error / @ts-nocheck
// comments. Every src/*.ts (a declaration file src/NAME.d.ts counts too, as NAME.d) must have none.
// Usage: node tools/type-hardness.mjs [--check] [--files a,b]
//   --check       exit 1 if any module has an error, an `any` or an ignore comment
//   --files a,b   counts for the named modules
import ts from 'typescript';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function measure() {
  const config = ts.getParsedCommandLineOfConfigFile(
    path.join(root, 'tsconfig.json'),
    {noEmit: true},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: d => {
        throw Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      }
    }
  );
  if (!config) throw Error('tsconfig.json could not be read');
  if (!config.options.strict) throw Error('tsconfig.json must keep "strict": true');
  const program = ts.createProgram({rootNames: config.fileNames, options: config.options});
  const files = new Map();
  for (const sf of program.getSourceFiles()) {
    const rel = path.relative(root, sf.fileName).replaceAll('\\', '/');
    if (!/^src\/[^/]+\.ts$/.test(rel)) continue;
    const name = rel.slice(4, -3);
    let any = 0;
    const visit = n => {
      if (n.kind === ts.SyntaxKind.AnyKeyword) any++;
      ts.forEachChild(n, visit);
    };
    visit(sf);
    const ignores = (sf.text.match(/@ts-(?:ignore|expect-error|nocheck)\b/g) || []).length;
    const errors = program.getSemanticDiagnostics(sf).length + program.getSyntacticDiagnostics(sf).length;
    files.set(name, {errors, any, ignores});
  }
  return files;
}
export const isHard = f => f.errors === 0 && f.any === 0 && f.ignores === 0;

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const files = measure(),
    total = {files: files.size, hard: 0, errors: 0, any: 0, ignores: 0};
  for (const f of files.values()) {
    total.errors += f.errors;
    total.any += f.any;
    total.ignores += f.ignores;
    if (isHard(f)) total.hard++;
  }
  const soft = [...files].filter(([, f]) => !isHard(f)).map(([name, f]) => ({name, ...f}));
  console.log(JSON.stringify({...total, soft}));
  const only = process.argv.indexOf('--files');
  if (only > 0)
    for (const name of process.argv[only + 1].split(',')) {
      const f = files.get(name);
      console.log(
        f
          ? `${name}\terrors ${f.errors}\tany ${f.any}\tignores ${f.ignores}\t${isHard(f) ? 'hard' : 'soft'}`
          : `${name}\tmissing`
      );
    }
  if (process.argv.includes('--check') && (soft.length || !files.size)) process.exitCode = 1;
}

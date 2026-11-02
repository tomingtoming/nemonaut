// Generated into dist by tools/build.mjs (run from the repository root).
import {build} from 'esbuild';
await build({
  entryPoints: ['tools/takeoff-controller-entry.mjs'],
  outfile: 'dist/takeoff-controller.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  plugins: [
    {
      name: 'share-live-modules',
      setup(b) {
        b.onResolve({filter: /^three$/}, () => ({path: 'three', external: true}));
        b.onResolve({filter: /^\.\.\/dist\//}, args => ({
          path: './' + args.path.slice('../dist/'.length),
          external: true
        }));
      }
    }
  ]
});

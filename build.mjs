import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const entries = [
  { entryPoints: ['src/content-dsp.ts'],   outfile: 'dist/content-dsp.js'   },
  { entryPoints: ['src/content-bridge.ts'], outfile: 'dist/content-bridge.js' },
  { entryPoints: ['src/popup.ts'],          outfile: 'dist/popup.js'          },
];

const shared = {
  bundle: true,
  format: /** @type {const} */ ('iife'),
  target: 'chrome120',
  sourcemap: false,
};

if (watch) {
  const ctxs = await Promise.all(entries.map((e) => context({ ...shared, ...e })));
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log('[SculptEQ] Watching for changes…');
} else {
  await Promise.all(entries.map((e) => build({ ...shared, ...e })));
  console.log('[SculptEQ] Build complete');
}

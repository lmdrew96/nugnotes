// Builds the static assets SuperDoc loads by URL (so they live in public/,
// outside Vite's bundle). Output is gitignored and rebuilt by `pnpm dev` and
// `pnpm build`. Ported from Folio.
//   - public/superdoc/collab-worker.js: SuperDoc's collaboration worker plus
//     NugNotes' Convex provider adapter, bundled into one module worker.
//   - public/superdoc/fonts/*.woff2: the editor's fonts, copied from
//     assets/superdoc-fonts/ (the list lives in src/superdoc/fonts.ts).
//   - public/superdoc/template.docx: the file every note starts from
//     (scripts/nugnotes-docx-template.mjs).
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { buildNugNotesTemplate } from './nugnotes-docx-template.mjs';

await build({
  entryPoints: ['src/superdoc/collab-worker.ts'],
  outfile: 'public/superdoc/collab-worker.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  logLevel: 'warning',
});

// Load the font list from the app's own module so the two can't drift.
const fontsModule = await build({
  entryPoints: ['src/superdoc/fonts.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'warning',
});
const { SUPERDOC_FONTS, DEFAULT_SUPERDOC_FONT, fontFiles } = await import(
  `data:text/javascript;base64,${Buffer.from(fontsModule.outputFiles[0].text).toString('base64')}`
);

const outDir = 'public/superdoc/fonts';
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
for (const font of SUPERDOC_FONTS) {
  for (const file of fontFiles(font)) {
    await copyFile(path.join('assets/superdoc-fonts', file), path.join(outDir, file));
  }
}

await writeFile(
  'public/superdoc/template.docx',
  await buildNugNotesTemplate(DEFAULT_SUPERDOC_FONT),
);

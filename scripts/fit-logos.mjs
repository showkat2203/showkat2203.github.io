/**
 * Refits the viewBox of every SVG already in public/img/logos/ to its ink
 * bounds. Use after saving a logo by hand; `npm run logos:fetch` does this
 * itself.
 *
 *   npm run logos
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { fitViewBoxes } from './logo-lib.mjs';

const dir = 'public/img/logos';
const files = (await readdir(dir)).filter((f) => f.endsWith('.svg'));

if (files.length === 0) {
  console.log('no logos to fit');
  process.exit(0);
}

const entries = await Promise.all(
  files.map(async (f) => ({ name: f.replace(/\.svg$/, ''), svg: await readFile(`${dir}/${f}`, 'utf8') })),
);

for (const result of await fitViewBoxes(entries)) {
  if (!result.fitted) {
    console.log(`skip   ${result.name} (no measurable geometry)`);
    continue;
  }
  await writeFile(`${dir}/${result.name}.svg`, `${result.svg}\n`);
  console.log(`fitted ${result.name.padEnd(12)} viewBox="${result.viewBox}"  aspect ${result.ratio.toFixed(2)}:1`);
}

// A missing logo file falls back to a monogram, which looks intentional rather
// than absent, so say plainly which institutions are still without one.
const institutions = parse(await readFile('src/content/institutions.yaml', 'utf8'));
const present = new Set(files.map((f) => f.replace(/\.svg$/, '')));
const missing = Object.entries(institutions)
  .filter(([key, v]) => v?.logoSource && !present.has(key))
  .map(([key, v]) => ({ key, url: v.logoSource }));

if (missing.length > 0) {
  console.log(`\n${missing.length} institution(s) have a logoSource but no file, so they show a monogram:`);
  for (const m of missing) console.log(`  ${m.key.padEnd(12)} ${m.url}`);
  console.log('\nRun `npm run logos:fetch`, or download them and use `npm run logos:import -- <dir>`.');
} else {
  console.log('\nEvery institution with a logoSource has a file.');
}

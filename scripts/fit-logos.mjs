/**
 * Refits the viewBox of every SVG already in public/img/logos/ to its ink
 * bounds. Use after saving a logo by hand; `npm run logos:fetch` does this
 * itself.
 *
 *   npm run logos
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
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

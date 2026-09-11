/**
 * Imports logo SVGs that were downloaded elsewhere.
 *
 *   npm run logos:import ~/portfolio_logos
 *
 * Filenames from logo bundles rarely match this site's institution keys
 * ("university_of_arizona.svg" against "arizona"), and a mismatch fails
 * silently — the tile just falls back to a monogram. So match on the
 * institution's key, name, or short name, sanitise, refit the viewBox, and say
 * exactly what landed where and what did not match.
 */
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { parse } from 'yaml';
import { sanitiseSvg, fitViewBoxes } from './logo-lib.mjs';

const source = process.argv[2];
if (!source) {
  console.error('usage: npm run logos:import -- <directory of svg files>');
  process.exit(1);
}
try {
  if (!(await stat(source)).isDirectory()) throw new Error('not a directory');
} catch {
  console.error(`cannot read ${source}`);
  process.exit(1);
}

const dest = 'public/img/logos';
await mkdir(dest, { recursive: true });

const institutions = parse(await readFile('src/content/institutions.yaml', 'utf8'));
const flatten = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** key, plus its name and short name, all flattened for comparison. */
const index = Object.entries(institutions).map(([key, v]) => ({
  key,
  aliases: new Set([flatten(key), flatten(v.name ?? ''), flatten(v.short ?? '')].filter(Boolean)),
}));

const files = (await readdir(source)).filter((f) => extname(f).toLowerCase() === '.svg');
if (files.length === 0) {
  console.error(`no .svg files in ${source}`);
  process.exit(1);
}

const matched = [];
const unmatched = [];

for (const file of files) {
  const stem = flatten(basename(file, extname(file)));
  const hit = index.find((i) => i.aliases.has(stem)) ?? index.find((i) => i.aliases.has(stem.replace(/^the/, '')));
  if (!hit) {
    unmatched.push(file);
    continue;
  }
  try {
    matched.push({ name: hit.key, svg: sanitiseSvg(await readFile(join(source, file), 'utf8')), from: file });
  } catch (err) {
    console.log(`SKIP    ${file.padEnd(40)} ${err.message}`);
  }
}

for (const result of await fitViewBoxes(matched)) {
  const from = matched.find((m) => m.name === result.name)?.from ?? '';
  await writeFile(`${dest}/${result.name}.svg`, `${result.svg}\n`);
  const shape = result.fitted ? `aspect ${result.ratio.toFixed(2)}:1` : 'viewBox left as-is';
  console.log(`imported ${from.padEnd(40)} -> ${result.name}.svg  ${shape}`);
}

console.log(`\n${matched.length} of ${files.length} files imported into ${dest}/`);

if (unmatched.length > 0) {
  console.log('\nNo institution matched these, so they were left alone:');
  for (const f of unmatched) console.log(`  ${f}`);
  console.log('\nKnown keys:', index.map((i) => i.key).join(', '));
  console.log('Rename the file to <key>.svg, or add the institution to institutions.yaml.');
}

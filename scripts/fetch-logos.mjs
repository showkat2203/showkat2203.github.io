/**
 * Downloads every institution logo named by `logoSource` in
 * src/content/institutions.yaml, sanitises it, refits its viewBox, and writes
 * public/img/logos/<key>.svg.
 *
 *   npm run logos:fetch
 *
 * Needs outbound network access, so run it locally rather than in a sandbox.
 * Colours are kept as drawn: logos sit on a white tile in both themes, which
 * is the background brand marks are designed for. Pass --mono to flatten them
 * to currentColor instead.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parse } from 'yaml';
import { sanitiseSvg, fitViewBoxes } from './logo-lib.mjs';

const mono = process.argv.includes('--mono');
const dir = 'public/img/logos';
await mkdir(dir, { recursive: true });

const institutions = parse(await readFile('src/content/institutions.yaml', 'utf8'));
const targets = Object.entries(institutions).filter(([, v]) => v?.logoSource);

if (targets.length === 0) {
  console.log('no logoSource entries in institutions.yaml');
  process.exit(0);
}

const fetched = [];
for (const [key, value] of targets) {
  try {
    const res = await fetch(value.logoSource, {
      headers: { 'user-agent': 'chy.io-logo-fetch/1.0 (+https://chy.io; personal site build)' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const type = res.headers.get('content-type') ?? '';
    const body = await res.text();
    if (!/svg/i.test(type) && !body.includes('<svg')) {
      throw new Error(`not an SVG (content-type: ${type || 'none'})`);
    }

    let svg = sanitiseSvg(body);
    if (mono) {
      svg = svg
        .replace(/\sfill="(?!none)[^"]*"/gi, ' fill="currentColor"')
        .replace(/\sstroke="(?!none)[^"]*"/gi, ' stroke="currentColor"');
    }
    fetched.push({ name: key, svg });
    console.log(`fetched  ${key.padEnd(12)} ${(body.length / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.log(`FAILED   ${key.padEnd(12)} ${err.message}  <- ${value.logoSource}`);
  }
}

if (fetched.length === 0) process.exit(1);

for (const result of await fitViewBoxes(fetched)) {
  await writeFile(`${dir}/${result.name}.svg`, `${result.svg}\n`);
  const shape = result.fitted ? `aspect ${result.ratio.toFixed(2)}:1` : 'viewBox left as-is';
  console.log(`wrote    ${result.name.padEnd(12)} ${shape}`);
}

console.log(`\n${fetched.length} of ${targets.length} logos written to ${dir}/`);
if (fetched.length < targets.length) {
  console.log('Re-run, or save the failures by hand and run `npm run logos`.');
}

/**
 * Tightens the viewBox of every SVG in public/img/logos/ to its ink bounds.
 *
 * Icon sets store marks in a square viewBox regardless of shape, so a wide
 * wordmark ends up as a thin band inside a lot of empty space. Fitting the box
 * to the geometry lets the tile size marks by height and get a consistent
 * optical weight. Run after adding a logo:
 *
 *   npm run logos
 */
import { chromium } from 'playwright';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { launch } from './lib.mjs';

const dir = 'public/img/logos';
const files = (await readdir(dir)).filter((f) => f.endsWith('.svg'));
if (files.length === 0) {
  console.log('no logos to fit');
  process.exit(0);
}

const browser = await launch(chromium);
const page = await browser.newPage();

for (const file of files) {
  const raw = await readFile(`${dir}/${file}`, 'utf8');
  const box = await page.evaluate((svgText) => {
    document.body.innerHTML = svgText;
    const svg = document.querySelector('svg');
    if (!svg) return null;
    svg.setAttribute('width', '512');
    svg.setAttribute('height', '512');
    const b = svg.getBBox();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }, raw);

  if (!box || box.width <= 0 || box.height <= 0) {
    console.log(`skip   ${file} (no measurable geometry)`);
    continue;
  }

  // A hair of padding so strokes and round joins are not clipped.
  const pad = Math.max(box.width, box.height) * 0.02;
  const vb = [box.x - pad, box.y - pad, box.width + pad * 2, box.height + pad * 2]
    .map((n) => Math.round(n * 100) / 100)
    .join(' ');

  const before = (raw.match(/viewBox="[^"]*"/) ?? ['none'])[0];
  const out = /viewBox="[^"]*"/.test(raw)
    ? raw.replace(/viewBox="[^"]*"/, `viewBox="${vb}"`)
    : raw.replace(/<svg/, `<svg viewBox="${vb}"`);
  await writeFile(`${dir}/${file}`, out);
  console.log(`fitted ${file.padEnd(14)} ${before} -> viewBox="${vb}"`);
}

await browser.close();

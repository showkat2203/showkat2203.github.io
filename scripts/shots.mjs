/** Screenshots for design review: npm run shots */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { serve, launch } from './lib.mjs';

const server = await serve();
await mkdir('.shots', { recursive: true });
const browser = await launch(chromium);

const shots = [
  ['home-desktop', '/', 1280, 900, true],
  ['home-360', '/', 360, 740, true],
  ['pubs-desktop', '/publications/', 1280, 900, true],
  ['pubs-360', '/publications/', 360, 740, true],
  ['cv-desktop', '/cv/', 1280, 900, false],
];

for (const [name, path, width, height, fullPage] of shots) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:4321${path}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `.shots/${name}.png`, fullPage });
  await page.close();
}

await browser.close();
server.close();
console.log('screenshots in .shots/');

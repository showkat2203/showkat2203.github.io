/**
 * Previews the logo rows with stand-in artwork, into .shots/.
 *
 *   npm run logos:preview
 *
 * The institution logos load from third-party URLs, so in an offline or
 * restricted environment they simply fail and fall back to monograms — which
 * makes the layout impossible to check. This intercepts each request and
 * fulfils it with a placeholder at a plausible aspect ratio, so the tile
 * sizing and grid can be reviewed without the network.
 *
 * The placeholders are NOT the real marks. This verifies layout, not artwork.
 */
import { chromium } from 'playwright';
import { serve, launch } from './lib.mjs';

const shapes = [
  ['Amazon_Web_Services_2025', 300, 100, '#232f3e', 'aws'],
  ['Samsung_logo_wordmark', 600, 100, '#1428a0', 'SAMSUNG'],
  ['University_of_Arizona_logo', 400, 100, '#0c234b', 'ARIZONA'],
  ['43086529a28ccb5c9f2f2eec560ffa85e09c6881', 120, 100, '#1f6feb', 'ICPC'],
  ['Tyson_Foods_corporate_logo', 250, 100, '#0033a0', 'Tyson'],
  ['Divine_IT', 350, 100, '#e11d48', 'DivineIT'],
  ['Baylor_University_logo', 450, 100, '#154734', 'BAYLOR'],
  ['daffodil-international-university', 100, 100, '#f59e0b', 'DIU'],
];

const server = await serve();
const b = await launch(chromium);

for (const [name, scheme] of [['sim-light', 'light'], ['sim-dark', 'dark']]) {
  const ctx = await b.newContext({ viewport: { width: 1340, height: 900 }, colorScheme: scheme, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('**/*.svg', (route) => {
    const url = route.request().url();
    if (url.includes('localhost')) return route.continue();
    const hit = shapes.find(([id]) => url.includes(id));
    if (!hit) return route.abort();
    const [, w, h, fill, label] = hit;
    const fs = Math.min(h * 0.55, (w / label.length) * 1.7);
    route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><text x="${w / 2}" y="${h / 2}" dominant-baseline="central" text-anchor="middle" font-family="Helvetica,Arial" font-weight="700" font-size="${fs}" fill="${fill}">${label}</text></svg>`,
    });
  });
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.locator('.orgs').screenshot({ path: `.shots/${name}.png` });
  await page.locator('.tl').screenshot({ path: `.shots/${name}-tl.png` });
  await ctx.close();
}
await b.close();
server.close();
console.log('ok');

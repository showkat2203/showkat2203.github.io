/**
 * Renders public/og.png (1200x630) from the site's own design tokens, so the
 * social card is the magnitude rail rather than a screenshot or a stock frame.
 * Run after a build: npm run build && npm run og
 */
import { chromium } from 'playwright';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { parse } from 'yaml';
import { serve, launch } from './lib.mjs';

const profile = parse(await readFile('src/content/profile.yaml', 'utf8')).main;
const domains = parse(await readFile('src/content/domains.yaml', 'utf8'));
const bands = Object.values(domains).sort((a, b) => a.order - b.order);

const sup = (n) => String(n).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family:'Archivo'; src:url('http://localhost:4321/fonts/archivo-var.woff2') format('woff2-variations'); font-weight:100 900; font-stretch:62% 125%; }
  @font-face { font-family:'DM Mono'; src:url('http://localhost:4321/fonts/dm-mono-500.woff2') format('woff2'); font-weight:500; }
  * { box-sizing:border-box; margin:0; }
  body { width:1200px; height:630px; background:#f4f5f3; color:#171a1c;
         font-family:'Archivo'; display:grid; grid-template-columns:232px 1fr;
         padding:72px 80px; }
  .rail { border-right:1px solid #d3d7d2; padding-right:28px; text-align:right;
          font-family:'DM Mono'; font-weight:500; display:flex;
          flex-direction:column; justify-content:center; gap:54px; }
  .tick { position:relative; }
  .tick .fig { font-size:22px; line-height:1.2; }
  .tick .unit { font-size:14px; font-weight:400; color:#696f6a; margin-top:4px; }
  /* The mark sits on the rail line itself, level with its figure. */
  .tick .mark { position:absolute; right:-32px; top:9px; width:8px; height:8px; background:#1e3fa8; }
  .body { padding-left:44px; display:flex; flex-direction:column; justify-content:center; }
  .name { font-size:20px; font-variation-settings:'wght' 600; letter-spacing:.01em; }
  .sentence { margin-top:26px; font-size:56px; line-height:1.1; letter-spacing:-.022em;
              font-variation-settings:'wght' 500,'wdth' 94; max-width:19ch; }
  .foot { margin-top:34px; font-family:'DM Mono'; font-size:15px; color:#696f6a; }
</style></head><body>
  <div class="rail">
    ${bands
      .map(
        (b) =>
          `<div class="tick"><span class="mark"></span><div class="fig">10${sup(b.exponent)}</div><div class="unit">${b.unit}</div></div>`,
      )
      .join('')}
  </div>
  <div class="body">
    <div class="name">${profile.name}</div>
    <div class="sentence">${profile.heroSentence}</div>
    <div class="foot">${profile.record.publications} publications, ${profile.record.citations} citations, h-index ${profile.record.hIndex}</div>
  </div>
</body></html>`;

// Written into dist/ and loaded over http so the font files are same-origin;
// setContent() leaves the page on about:blank, where they are blocked.
await writeFile('dist/__og.html', html);
const server = await serve();
const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto('http://localhost:4321/__og.html', { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await writeFile('public/og.png', await page.screenshot());
await browser.close();
server.close();
await rm('dist/__og.html', { force: true });
console.log('wrote public/og.png');

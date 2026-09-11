/**
 * Renders public/og.png (1200x630) from the site's own tokens and portrait, so
 * the social card matches the page rather than being a separate artefact.
 *
 *   npm run build && npm run og
 */
import { chromium } from 'playwright';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { parse } from 'yaml';
import { serve, launch } from './lib.mjs';

const p = parse(await readFile('src/content/profile.yaml', 'utf8')).main;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:'SS';src:url('http://localhost:4321/fonts/source-serif.woff2') format('woff2-variations');font-weight:200 900}
  @font-face{font-family:'SSI';src:url('http://localhost:4321/fonts/source-serif-italic.woff2') format('woff2-variations');font-weight:200 900}
  @font-face{font-family:'IT';src:url('http://localhost:4321/fonts/inter-tight.woff2') format('woff2-variations');font-weight:100 900}
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:#fbfaf9;color:#15181c;font-family:'IT',sans-serif;
       display:grid;grid-template-columns:1.18fr .82fr;gap:56px;padding:64px 68px;align-items:center}
  .kick{font-size:17px;font-weight:600;color:#1b3a6b}
  h1{font-family:'SS',serif;font-size:62px;line-height:1.04;letter-spacing:-.03em;font-weight:600;
     margin-top:16px;max-width:17ch}
  .rule{height:1px;background:#e3e0da;margin:30px 0 22px}
  .orgs{font-family:'SS',serif;font-size:19px;font-weight:600;color:#15181c}
  .orgs i{font-family:'SSI',serif;font-weight:400;font-style:italic;font-size:15px;color:#565c64;margin-right:12px}
  .figs{display:flex;gap:34px;margin-top:22px}
  .fig b{font-family:'SS',serif;font-size:30px;font-weight:600;color:#1b3a6b;display:block;line-height:1}
  .fig span{font-size:13.5px;color:#565c64}
  .photo{position:relative}
  .photo{border:1px solid #e3e0da;border-radius:3px;overflow:hidden}
  .photo img{width:100%;display:block}
</style></head><body>
  <div>
    <p class="kick">${p.name} &mdash; ${p.role}, ${p.locationShort}</p>
    <h1>${p.headline}</h1>
    <div class="rule"></div>
    <p class="orgs"><i>Built systems at</i> Amazon Web Services, Samsung Research, Baylor</p>
    <div class="figs">
      <div class="fig"><b>${p.record.publications}</b><span>peer-reviewed papers</span></div>
      <div class="fig"><b>${p.record.citations}</b><span>citations</span></div>
      <div class="fig"><b>${p.record.hIndex}</b><span>h-index</span></div>
      <div class="fig"><b>2M+</b><span>devices shipped</span></div>
    </div>
  </div>
  <figure class="photo"><img src="http://localhost:4321/img/portrait-800.webp" alt=""></figure>
</body></html>`;

// Written into dist/ and loaded over http so the fonts are same-origin;
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

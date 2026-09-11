/**
 * Renders the social cards from the site's own tokens, portrait and content,
 * so a card matches the page rather than being a separate artefact that drifts.
 *
 *   public/og.png            the site card
 *   public/og/<slug>.png     one per published post
 *
 *   npm run build && npm run og
 */
import { chromium } from 'playwright';
import { readFile, readdir, writeFile, rm, mkdir } from 'node:fs/promises';
import { parse } from 'yaml';
import { serve, launch } from './lib.mjs';

const p = parse(await readFile('src/content/profile.yaml', 'utf8')).main;

// Derived rather than typed out, so the card cannot name a different set of
// organisations than the credibility row on the page does.
const institutions = parse(await readFile('src/content/institutions.yaml', 'utf8'));
const orgs = Object.values(institutions)
  .filter((i) => i.featured)
  .sort((a, b) => a.order - b.order)
  .map((i) => i.short);

/** Front matter of every published post, newest first. */
async function posts() {
  const dir = 'src/content/blog';
  const found = [];
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.md')) continue;
    const raw = await readFile(`${dir}/${name}`, 'utf8');
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) continue;
    const data = parse(fm[1]);
    if (data.draft) continue;
    found.push({ slug: name.replace(/\.md$/, ''), ...data });
  }
  return found.sort((a, b) => new Date(b.date) - new Date(a.date));
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SHELL = (body, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:'SS';src:url('http://localhost:4321/fonts/source-serif.woff2') format('woff2-variations');font-weight:200 900}
  @font-face{font-family:'SSI';src:url('http://localhost:4321/fonts/source-serif-italic.woff2') format('woff2-variations');font-weight:200 900}
  @font-face{font-family:'IT';src:url('http://localhost:4321/fonts/inter-tight.woff2') format('woff2-variations');font-weight:100 900}
  @font-face{font-family:'DM';src:url('http://localhost:4321/fonts/dm-mono-400.woff2') format('woff2')}
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:#fbfaf9;color:#15181c;font-family:'IT',sans-serif}
  .kick{font-size:17px;font-weight:600;color:#1b3a6b}
  .rule{height:1px;background:#e3e0da}
  ${extra}
</style></head><body>${body}</body></html>`;

const siteCard = SHELL(
  `<div>
    <p class="kick">${esc(p.name)} &mdash; ${esc(p.role)}, ${esc(p.locationShort)}</p>
    <h1>${esc(p.headline)}</h1>
    <div class="rule"></div>
    <p class="orgs"><i>Built systems at</i> ${orgs.map(esc).join(', ')}</p>
  </div>
  <figure class="photo"><img src="http://localhost:4321/img/portrait-800.webp" alt=""></figure>`,
  `body{display:grid;grid-template-columns:1.18fr .82fr;gap:56px;padding:64px 68px;align-items:center}
   h1{font-family:'SS',serif;font-size:62px;line-height:1.04;letter-spacing:-.03em;font-weight:600;
      margin-top:16px;max-width:17ch}
   .rule{margin:30px 0 22px}
   .orgs{font-family:'SS',serif;font-size:19px;font-weight:600}
   .orgs i{font-family:'SSI',serif;font-weight:400;font-style:italic;font-size:15px;color:#565c64;margin-right:12px}
   .photo{border:1px solid #e3e0da;border-radius:3px;overflow:hidden}
   .photo img{width:100%;display:block}`,
);

/**
 * A post's card leads with the title, because that is what a reader is
 * deciding on. The title sets one step down when it is long enough to need
 * the room, so a five-word and a fifteen-word title both fill the frame.
 */
const postCard = (post) =>
  SHELL(
    `<div class="top">
      <p class="kick">${esc(p.name)} &mdash; writing</p>
      <h1 class="${post.title.length > 52 ? 'long' : ''}">${esc(post.title)}</h1>
      <p class="desc">${esc(post.description)}</p>
    </div>
    <div class="foot">
      <div class="rule"></div>
      <p class="meta"><span class="date">${new Date(post.date).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })}</span>${(post.tags ?? []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</p>
    </div>`,
    `body{display:flex;flex-direction:column;justify-content:space-between;padding:64px 68px}
     h1{font-family:'SS',serif;font-size:64px;line-height:1.06;letter-spacing:-.03em;font-weight:600;
        margin-top:18px;max-width:20ch}
     h1.long{font-size:52px;max-width:24ch}
     .desc{margin-top:22px;font-size:21px;line-height:1.5;color:#565c64;max-width:48ch}
     .foot .rule{margin-bottom:20px}
     .meta{display:flex;align-items:center;gap:14px;font-family:'DM',monospace;font-size:15px;color:#565c64}
     .date{color:#15181c}
     .tag{border:1px solid #e3e0da;border-radius:3px;padding:3px 10px;font-size:13px}`,
  );

// Written into dist/ and loaded over http so the fonts are same-origin;
// setContent() leaves the page on about:blank, where they are blocked.
const server = await serve();
const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

async function shoot(html, out) {
  await writeFile('dist/__og.html', html);
  await page.goto('http://localhost:4321/__og.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await writeFile(out, await page.screenshot());
  console.log(`wrote ${out}`);
}

await shoot(siteCard, 'public/og.png');

await mkdir('public/og', { recursive: true });
const all = await posts();
for (const post of all) await shoot(postCard(post), `public/og/${post.slug}.png`);

await browser.close();
server.close();
await rm('dist/__og.html', { force: true });
console.log(`${all.length} post card(s)`);

/** Behavioural and responsive checks that a11y/Lighthouse do not cover. */
import { chromium } from 'playwright';
import { serve, launch } from './lib.mjs';
import { sanitiseSvg } from './logo-lib.mjs';

const server = await serve();
const browser = await launch(chromium);
const results = [];
const check = (name, pass, detail = '') => results.push({ check: name, pass: pass ? 'ok' : 'FAIL', detail });

// --- svg sanitiser contract ----------------------------------------------
// Checked directly rather than through the page: a partly-stripped logo can
// still paint something, so rendering alone does not prove the rules hold.
{
  const fixture = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" viewBox="0 0 200 60">
    <title>Example</title>
    <script>alert(1)</script>
    <rect x="0" y="0" width="200" height="60" fill="#0c234b" onclick="steal()"/>
    <image href="https://example.com/x.png" width="10" height="10"/>
    <text x="10" y="40" fill="#fff">Mark</text>
  </svg>`;
  const out = sanitiseSvg(fixture);
  const root = out.slice(0, out.indexOf('>'));

  check('sanitiser drops root width and height', !/\s(width|height)=/.test(root), root);
  check(
    'sanitiser keeps inner width and height',
    /<rect[^>]*\swidth="200"[^>]*\sheight="60"/.test(out),
    'rect dimensions must survive or rect-based logos render blank',
  );
  check('sanitiser keeps the viewBox', /viewBox="0 0 200 60"/.test(out));
  check('sanitiser removes script elements', !/<script/i.test(out));
  check('sanitiser removes inline event handlers', !/\sonclick=/i.test(out));
  // xmlns is legitimately an http URI, so test for remote href/src specifically.
  check(
    'sanitiser removes remote references',
    !/(?:xlink:)?(?:href|src)\s*=\s*"(?:https?:)?\/\//i.test(out),
    out.slice(0, 120),
  );
  check('sanitiser removes the title', !/<title>/i.test(out));
  check('sanitiser marks the root decorative', /aria-hidden="true"/.test(root));
  check('sanitiser keeps fills', /fill="#0c234b"/.test(out));
}

// --- no horizontal overflow at narrow widths -----------------------------
for (const width of [320, 360, 414, 768]) {
  for (const path of ['/', '/publications', '/cv']) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:4321${path}`, { waitUntil: 'networkidle' });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`no h-scroll ${path} @${width}`, over <= 0, `overflow ${over}px`);
    await ctx.close();
  }
}

// --- keyboard focus is visible -------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:4321/publications', { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab'); // skip link
  const skip = await page.evaluate(() => {
    const el = document.activeElement;
    return { cls: el?.className, left: el?.getBoundingClientRect().left };
  });
  check('skip link focuses into view', skip.cls === 'skip' && skip.left >= 0, JSON.stringify(skip));

  const outline = await page.evaluate(() => {
    const btn = document.querySelector('.filter button');
    btn.focus();
    const s = getComputedStyle(btn);
    return { w: s.outlineWidth, style: s.outlineStyle };
  });
  check('focus ring on filter button', outline.style !== 'none' && parseFloat(outline.w) >= 2, JSON.stringify(outline));

  // --- filter behaviour --------------------------------------------------
  const before = await page.locator('.pub:not([hidden])').count();
  await page.click('button[data-type="journal"]');
  const journals = await page.locator('.pub:not([hidden])').count();
  await page.click('button[data-type="conference"]');
  const confs = await page.locator('.pub:not([hidden])').count();
  await page.click('button[data-type="all"]');
  const back = await page.locator('.pub:not([hidden])').count();
  check('filter narrows and restores', before === 12 && journals === 4 && confs === 8 && back === 12,
    `all ${before}, journal ${journals}, conference ${confs}, back ${back}`);
  const pressed = await page.getAttribute('button[data-type="all"]', 'aria-pressed');
  check('filter sets aria-pressed', pressed === 'true', `aria-pressed=${pressed}`);
  await page.close();
}

// --- copy button ---------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await page.click('.copy__btn');
  // The handler awaits the clipboard promise, so wait for the confirmation
  // rather than reading synchronously after the click.
  await page.waitForSelector('.copy__said[data-shown]', { timeout: 2000 }).catch(() => {});
  const said = await page.textContent('.copy__said');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('copy writes the address', clip === 'mdshowkathossainchy@gmail.com', clip);
  check('copy confirms visibly', said.trim().length > 0, said);
  await ctx.close();
}

// --- reduced motion ------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  const behaviour = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  check('smooth scrolling off under reduced motion', behaviour === 'auto', behaviour);
  await ctx.close();
}

// --- images and the blog -------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  const imgs = await page.evaluate(() =>
    Array.from(document.images).filter((i) => !i.closest('.mark')).map((i) => ({
      alt: i.getAttribute('alt'),
      loaded: i.complete && i.naturalWidth > 0,
      dims: Boolean(i.getAttribute('width') && i.getAttribute('height')),
    })),
  );
  check('every image has an alt attribute', imgs.every((i) => i.alt !== null), JSON.stringify(imgs.map((i) => i.alt)));
  check('every local image loads', imgs.every((i) => i.loaded), `${imgs.filter((i) => !i.loaded).length} broken`);
  check('portrait declares width and height', imgs.every((i) => i.dims), `${imgs.length} checked`);

  // Logo tiles are excluded above: their images are remote, blocked by this
  // sandbox, and intentionally carry no width/height, since the fixed tile
  // reserves the space so there is nothing to shift.
  const logoImgs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.mark img')).map((i) => i.getAttribute('alt')),
  );
  check('logo images are marked decorative', logoImgs.every((a) => a === ''), `${logoImgs.length} logo images`);

  const svgTitled = await page.evaluate(() =>
    Array.from(document.querySelectorAll('svg.dg')).every(
      (s) => s.getAttribute('role') === 'img' && (s.getAttribute('aria-label') ?? '').length > 30,
    ),
  );
  check('each diagram carries a descriptive label', svgTitled);
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:4321/blog', { waitUntil: 'networkidle' });
  const cards = await page.locator('.post').count();
  check('blog index lists posts', cards > 0, `${cards} posts`);
  await page.locator('.post__link').first().click();
  await page.waitForLoadState('networkidle');
  const hasProse = await page.locator('.prose h2').count();
  check('post page renders markdown', hasProse > 0, `${hasProse} headings`);
  await page.close();

  const rss = await browser.newPage();
  const res = await rss.goto('http://localhost:4321/rss.xml');
  const body = (await res.text()) ?? '';
  check('rss feed has items', body.includes('<item>'), `${body.length} bytes`);
  await rss.close();
}

// --- theme toggle --------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

  const read = () =>
    page.evaluate(() => ({
      attr: document.documentElement.dataset.theme ?? null,
      bg: getComputedStyle(document.body).backgroundColor,
      pressed: document.querySelector('[data-theme-toggle]')?.getAttribute('aria-pressed'),
      label: document.querySelector('.theme__label')?.textContent?.trim(),
      stored: (() => {
        try {
          return localStorage.getItem('theme');
        } catch {
          return 'unavailable';
        }
      })(),
    }));

  const start = await read();
  check('follows the light system preference', start.attr === null && start.pressed === 'false', JSON.stringify(start));

  await page.click('[data-theme-toggle]');
  const dark = await read();
  check('toggle switches to dark', dark.attr === 'dark' && dark.pressed === 'true', JSON.stringify(dark));
  check('dark repaints the page', dark.bg !== start.bg, `${start.bg} -> ${dark.bg}`);
  check('choice is persisted', dark.stored === 'dark', String(dark.stored));
  check('button label names the next state', dark.label === 'Switch to light mode', String(dark.label));

  await page.reload({ waitUntil: 'networkidle' });
  const afterReload = await read();
  check('choice survives a reload', afterReload.attr === 'dark', JSON.stringify(afterReload));

  await page.click('[data-theme-toggle]');
  const back = await read();
  check('toggle switches back to light', back.attr === 'light' && back.stored === 'light', JSON.stringify(back));
  await ctx.close();
}

// A dark system preference should render dark with no stored choice.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  const state = await page.evaluate(() => ({
    attr: document.documentElement.dataset.theme ?? null,
    bg: getComputedStyle(document.body).backgroundColor,
    pressed: document.querySelector('[data-theme-toggle]')?.getAttribute('aria-pressed'),
  }));
  check(
    'dark system preference renders dark without a stored choice',
    state.attr === null && state.pressed === 'true' && state.bg === 'rgb(15, 20, 25)',
    JSON.stringify(state),
  );
  await ctx.close();
}

// --- institution marks and news -----------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  const markCount = await page.locator('.mark').count();
  check('institution marks render', markCount >= 12, `${markCount} marks`);
  // The mark is decorative; the institution's name must be real text beside it.
  const marksDecorative = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.mark')).every(
      (m) =>
        m.getAttribute('aria-hidden') === 'true' &&
        (m.nextElementSibling?.textContent ?? '').trim().length > 2 &&
        m.nextElementSibling?.getAttribute('aria-hidden') === null,
    ),
  );
  check('marks are decorative with the name as real text', marksDecorative);
  // Two tiers to check. An inlined local SVG must have painted geometry:
  // sanitising it down to nothing still renders as an empty tile, which is how
  // the global width/height strip once blanked every rect-based mark. A remote
  // mark cannot be verified here at all, since this sandbox blocks those hosts,
  // so assert the contract instead — a resolvable src, and a monogram left in
  // the DOM to surface if the image fails.
  const marks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.mark--logo')).map((tile) => {
      const svg = tile.querySelector('svg');
      const img = tile.querySelector('img');
      const box = svg?.getBBox?.();
      return {
        kind: svg ? 'inline' : img ? 'remote' : 'none',
        ink: box ? box.width * box.height : 0,
        drawn: svg ? svg.getBoundingClientRect().width * svg.getBoundingClientRect().height : 0,
        src: img?.getAttribute('src') ?? null,
        onerror: img?.getAttribute('onerror') ?? null,
        mono: (tile.querySelector('.mark__mono')?.textContent ?? '').trim(),
      };
    }),
  );

  const inline = marks.filter((m) => m.kind === 'inline');
  const remote = marks.filter((m) => m.kind === 'remote');

  check(
    'inlined logos have painted geometry',
    inline.every((m) => m.ink > 0 && m.drawn > 16),
    `${inline.length} inline`,
  );
  check(
    'remote logos carry an https src and an error fallback',
    remote.every((m) => /^https:\/\//.test(m.src ?? '') && m.onerror === 'this.remove()'),
    `${remote.length} remote`,
  );
  check(
    'every logo tile keeps a monogram to fall back to',
    marks.length > 0 && marks.every((m) => m.mono.length > 0),
    `${marks.length} tiles`,
  );

  const newsRows = await page.locator('.news__row').count();
  check('news section lists entries', newsRows > 0, `${newsRows} entries`);
  await page.close();
}

// --- no-JS fallback ------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4321/publications', { waitUntil: 'load' });
  const visible = await page.locator('.pub:not([hidden])').count();
  check('all publications visible without JS', visible === 12, `${visible} visible`);
  await ctx.close();
}

console.table(results);
await browser.close();
server.close();
process.exit(results.some((r) => r.pass === 'FAIL') ? 1 : 0);

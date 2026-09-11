/** Behavioural and responsive checks that a11y/Lighthouse do not cover. */
import { chromium } from 'playwright';
import { serve, launch } from './lib.mjs';
import { sanitiseSvg } from './logo-lib.mjs';
import { rewriteOutbound } from '../src/integrations/outbound-links.mjs';
import { buildRecord, hIndexOf, venuesOf, fillTokens, formatAsOf } from '../src/lib/record.ts';

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

// --- outbound link rewriter contract -------------------------------------
// A transform over built HTML, so it is checked against the shapes it has to
// survive rather than only through the pages it happens to produce today.
{
  const site = 'https://chy.io';
  const one = (html) => rewriteOutbound(html, { site });

  const ext = one('<a href="https://scholar.google.com/x">Scholar</a>');
  check('rewriter adds target to an off-site link', /target="_blank"/.test(ext.html), ext.html);
  check('rewriter adds noopener and noreferrer', /rel="noopener noreferrer"/.test(ext.html), ext.html);
  check(
    'rewriter announces the new tab',
    /<span class="sr-only"> \(opens in a new tab\)<\/span><\/a>/.test(ext.html),
    ext.html,
  );

  for (const [label, html] of [
    ['a root-relative path', '<a href="/publications">Publications</a>'],
    ['a fragment', '<a href="#work">Work</a>'],
    ['a mailto', '<a href="mailto:a@b.com">mail</a>'],
    ['the canonical origin', '<a href="https://chy.io/cv">CV</a>'],
  ]) {
    const left = one(html);
    check(`rewriter leaves ${label} alone`, left.rewritten === 0 && left.html === html, left.html);
  }

  const already = one('<a href="https://example.com" target="_self">x</a>');
  check('rewriter respects an explicit target', already.rewritten === 0, already.html);

  const keptRel = one('<a href="https://example.com" rel="me">x</a>');
  check(
    'rewriter keeps an existing rel token',
    /rel="me noopener noreferrer"/.test(keptRel.html),
    keptRel.html,
  );

  const nested = one('<a href="https://example.com"><strong>bold</strong> text</a>');
  check(
    'rewriter preserves link contents',
    nested.html.includes('<strong>bold</strong> text<span class="sr-only">'),
    nested.html,
  );

  const pair = one('<a href="/a">in</a> <a href="https://example.com">out</a>');
  check('rewriter handles a mixed run', pair.rewritten === 1 && pair.html.startsWith('<a href="/a">in</a>'), pair.html);

  const bad = one('<a href="not a url">x</a>');
  check('rewriter ignores an unparseable href', bad.rewritten === 0, bad.html);

  const noTag = one('<p>no links here</p>');
  check('rewriter leaves link-free html byte-identical', noTag.html === '<p>no links here</p>', noTag.html);
}

// --- research record derivation ------------------------------------------
{
  check('h-index of an empty list is 0', hIndexOf([]) === 0);
  check('h-index counts papers at or above their rank', hIndexOf([10, 8, 5, 4, 3]) === 4, String(hIndexOf([10, 8, 5, 4, 3])));
  check('h-index is capped by paper count', hIndexOf([99, 99]) === 2, String(hIndexOf([99, 99])));
  check('h-index ignores zero-citation papers', hIndexOf([3, 2, 1, 0, 0]) === 2, String(hIndexOf([3, 2, 1, 0, 0])));

  const pubs = [
    { id: 'a', data: { venue: 'Long Journal Name', venueShort: 'JSS', year: 2025 } },
    { id: 'b', data: { venue: 'European Conference', venueShort: 'ECSA', year: 2024 } },
    { id: 'c', data: { venue: 'European Conference', venueShort: 'ECSA', year: 2023 } },
    { id: 'd', data: { venue: 'Old Workshop', venueShort: 'ICSEC', year: 2023 } },
  ];
  const venues = venuesOf(pubs);
  check('venues dedupe by short name', venues.length === 3, venues.join(', '));
  check('venues lead with the most recent', venues[0] === 'JSS', venues.join(', '));
  check('venues break ties by paper count', venues[1] === 'ECSA', venues.join(', '));

  const stored = { asOf: '2026-09', totalCitations: 148, hIndex: 8, perPublication: {} };
  const fallback = buildRecord(pubs, stored);
  check('record counts publications from the collection', fallback.publications === 4, String(fallback.publications));
  check('record falls back to stored citations', fallback.citations === 148 && !fallback.computed);

  const full = buildRecord(pubs, { ...stored, perPublication: { a: 10, b: 4, c: 2, d: 0 } });
  check('record computes citations when counts are complete', full.citations === 16 && full.computed, String(full.citations));
  // [10, 4, 2, 0]: two papers have at least two citations, none has three.
  check('record computes the h-index from counts', full.hIndex === 2, String(full.hIndex));

  const partial = buildRecord(pubs, { ...stored, perPublication: { a: 10 } });
  check('record ignores partial counts', partial.citations === 148 && !partial.computed, String(partial.citations));

  check(
    'tokens are filled from the record',
    fillTokens('{publications} papers, {citations} citations, h {hIndex}', fallback) ===
      '4 papers, 148 citations, h 8',
    fillTokens('{publications} papers, {citations} citations, h {hIndex}', fallback),
  );
  check(
    'unknown tokens are left alone',
    fillTokens('{unknown} and {citations}', fallback) === '{unknown} and 148',
    fillTokens('{unknown} and {citations}', fallback),
  );
  check('asOf renders as a month and year', formatAsOf('2026-09') === 'September 2026', formatAsOf('2026-09'));
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

  // The motion layer only adds arrival. With no script the page must already
  // be in its finished state: rules painted, figures showing real numbers.
  const noJs = await page.evaluate(() => ({
    anim: document.documentElement.classList.contains('anim'),
    figures: [...document.querySelectorAll('[data-figure]')].map((el) => el.textContent.trim()),
    borders: [...document.querySelectorAll('[data-rule]')].map((el) => getComputedStyle(el).borderTopWidth),
    opacity: [...document.querySelectorAll('[data-rule]')].map((el) => getComputedStyle(el).opacity),
  }));
  check('no-JS leaves the motion layer off', noJs.anim === false);
  check(
    'no-JS shows the real figures',
    noJs.figures.join(',') === '12,148,8',
    noJs.figures.join(','),
  );
  check(
    'no-JS still paints the section rules',
    noJs.borders.length > 0 && noJs.borders.every((w) => w !== '0px'),
    noJs.borders.join(','),
  );
  check(
    'no-JS hides nothing',
    noJs.opacity.every((o) => o === '1'),
    noJs.opacity.join(','),
  );
  await ctx.close();
}

// --- motion layer --------------------------------------------------------
{
  // Reduced motion: the layer never turns on, and nothing is left animating.
  const quiet = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const qp = await quiet.newPage();
  await qp.goto('http://localhost:4321/publications', { waitUntil: 'networkidle' });
  const q = await qp.evaluate(() => ({
    anim: document.documentElement.classList.contains('anim'),
    figures: [...document.querySelectorAll('[data-figure]')].map((el) => el.textContent.trim()),
    running: document.getAnimations().length,
  }));
  check('reduced motion leaves the layer off', q.anim === false);
  check('reduced motion shows the real figures', q.figures.join(',') === '12,148,8', q.figures.join(','));
  check('reduced motion runs no animations', q.running === 0, String(q.running));
  await quiet.close();

  // The layer redraws a rule the layout already has; it must never invent one.
  // So for each tagged element, a line painted with JS on has to correspond to
  // a real border with JS off. Compared by position, since the markup matches.
  for (const path of ['/', '/publications', '/cv', '/blog']) {
    const tagged = async (jsOn) => {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        javaScriptEnabled: jsOn,
        reducedMotion: 'no-preference',
      });
      const pg = await ctx.newPage();
      await pg.goto(`http://localhost:4321${path}`, { waitUntil: jsOn ? 'networkidle' : 'load' });
      const found = await pg.evaluate(() =>
        [...document.querySelectorAll('[data-rule]')].map((el) => ({
          name: el.className || el.tagName,
          paints: getComputedStyle(el).backgroundImage !== 'none',
          border: getComputedStyle(el).borderTopWidth !== '0px',
        })),
      );
      await ctx.close();
      return found;
    };

    const [live, bare] = [await tagged(true), await tagged(false)];
    const invented = live
      .map((el, i) => (el.paints && !bare[i]?.border ? el.name : null))
      .filter(Boolean);
    check(
      `no tagged rule is invented by the motion layer on ${path}`,
      live.length === bare.length && invented.length === 0,
      invented.join(', ') || `${live.length} tagged`,
    );
  }

  // Motion allowed: rules draw to full width and figures land on the real value.
  const live = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  const lp = await live.newPage();
  await lp.goto('http://localhost:4321/publications', { waitUntil: 'networkidle' });
  check('motion layer turns on', await lp.evaluate(() => document.documentElement.classList.contains('anim')));
  await lp.waitForTimeout(1600);
  const drawn = await lp.evaluate(() => ({
    figures: [...document.querySelectorAll('[data-figure]')].map((el) => el.textContent.trim()),
    sizes: [...document.querySelectorAll('[data-rule]')].map((el) => getComputedStyle(el).backgroundSize),
  }));
  check('counted figures settle on the real value', drawn.figures.join(',') === '12,148,8', drawn.figures.join(','));
  check(
    'drawn rules reach full width',
    drawn.sizes.length > 0 && drawn.sizes.every((size) => size.startsWith('100%')),
    drawn.sizes.join(' | '),
  );

  await lp.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  const frame = await lp.evaluate(() =>
    document
      .querySelector('.hero__photo')
      .getAnimations({ subtree: true })
      .map((a) => a.animationName),
  );
  check('the portrait frame animates in', frame.includes('frame-settle'), frame.join(','));
  check(
    'a rule below the fold waits its turn',
    (await lp.evaluate(() => document.querySelector('.tl__row:last-child').classList.contains('is-in'))) === false,
  );
  await lp.evaluate(() => document.querySelector('.tl__row:last-child').scrollIntoView({ behavior: 'instant' }));
  await lp.waitForTimeout(1600);
  const late = await lp.evaluate(() => {
    const row = document.querySelector('.tl__row:last-child');
    return { in: row.classList.contains('is-in'), size: getComputedStyle(row).backgroundSize };
  });
  check('a rule draws once scrolled into view', late.in && late.size.startsWith('100%'), JSON.stringify(late));
  check(
    'the first timeline row draws no rule',
    (await lp.evaluate(() => getComputedStyle(document.querySelector('.tl__row:first-child')).backgroundImage)) === 'none',
  );

  // A figure that changes width mid-count would jog the layout beside it.
  await lp.goto('http://localhost:4321/cv', { waitUntil: 'networkidle' });
  await lp.evaluate(() => document.querySelector('[data-figures]').scrollIntoView({ behavior: 'instant' }));
  const w1 = await lp.evaluate(() => document.querySelector('[data-figure]').getBoundingClientRect().width);
  await lp.waitForTimeout(1400);
  const w2 = await lp.evaluate(() => document.querySelector('[data-figure]').getBoundingClientRect().width);
  check('counting does not resize the figure', Math.abs(w1 - w2) < 0.6, `${w1.toFixed(2)} -> ${w2.toFixed(2)}`);
  await live.close();
}

console.table(results);
await browser.close();
server.close();
process.exit(results.some((r) => r.pass === 'FAIL') ? 1 : 0);

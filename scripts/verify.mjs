/** Behavioural and responsive checks that a11y/Lighthouse do not cover. */
import { chromium } from 'playwright';
import { readdir, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { serve, launch } from './lib.mjs';
// The domain comes from the build config, so a move cannot leave the checks
// asserting the old host while every page has already changed.
import astroConfig from '../astro.config.mjs';

const SITE = String(astroConfig.site).replace(/\/$/, '');
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
  const site = SITE;
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
    ['the canonical origin', `<a href="${SITE}/cv">CV</a>`],
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

  const stored = {
    asOf: '2026-09',
    totalCitations: 148,
    hIndex: 8,
    perPublication: {},
    source: { name: 'OpenAlex', id: 'A1', url: 'https://openalex.org/A1' },
  };
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
  check(
    'asOf keeps the day when the sync supplied one',
    formatAsOf('2026-09-12') === '12 September 2026',
    formatAsOf('2026-09-12'),
  );
  check(
    'the record carries the source of its figures',
    fallback.source.name === 'OpenAlex',
    JSON.stringify(fallback.source),
  );
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

// --- metadata and structured data ----------------------------------------
// Search engines are the only reader of most of this, so it is checked here
// rather than by looking at a page.
{
  const ROUTES = ['/', '/publications/', '/interview-prep/', '/cv/', '/blog/', '/blog/reconciliation-is-a-feature/'];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  for (const route of ROUTES) {
    await page.goto(`http://localhost:4321${route}`, { waitUntil: 'load' });
    const head = await page.evaluate(() => ({
      title: document.title,
      desc: document.querySelector('meta[name="description"]')?.content ?? '',
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? '',
      robots: document.querySelector('meta[name="robots"]')?.content ?? '',
      ogUrl: document.querySelector('meta[property="og:url"]')?.content ?? '',
      ogImage: document.querySelector('meta[property="og:image"]')?.content ?? '',
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
    }));

    const expected = `${SITE}${route}`;
    check(`canonical is the served URL on ${route}`, head.canonical === expected, head.canonical);
    check(`og:url matches canonical on ${route}`, head.ogUrl === expected, head.ogUrl);
    check(`exactly one h1 on ${route}`, head.h1.length === 1, head.h1.join(' | '));
    check(
      `title and description are present and distinct on ${route}`,
      head.title.length > 10 && head.desc.length > 50 && head.title !== head.desc,
      `${head.title.length}/${head.desc.length} chars`,
    );
    check(
      `no unsubstituted tokens in the description on ${route}`,
      !/\{(publications|citations|hIndex)\}/.test(head.desc),
      head.desc.slice(0, 60),
    );
    check(`robots lifts the image preview cap on ${route}`, head.robots.includes('max-image-preview:large'), head.robots);

    check(`one JSON-LD block on ${route}`, head.ld.length === 1, String(head.ld.length));
    let graph;
    try {
      graph = JSON.parse(head.ld[0]);
    } catch (err) {
      check(`JSON-LD parses on ${route}`, false, String(err));
      continue;
    }
    check(`JSON-LD parses on ${route}`, true, `${graph['@graph'].length} nodes`);
    check(`JSON-LD declares the schema.org context on ${route}`, graph['@context'] === 'https://schema.org');

    const nodes = graph['@graph'];
    const ids = new Set(nodes.map((n) => n['@id']).filter(Boolean));
    const types = nodes.map((n) => n['@type']);
    check(`graph carries the Person and WebSite on ${route}`, types.includes('Person') && types.includes('WebSite'), types.join(','));
    check(
      `every node is typed and identified on ${route}`,
      nodes.every((n) => n['@type'] && n['@id']),
      nodes.filter((n) => !n['@type'] || !n['@id']).length + ' bad',
    );

    // A reference to an @id this graph never defines is a dangling node.
    const refs = [];
    const walk = (value) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 1 && keys[0] === '@id') refs.push(value['@id']);
        else Object.values(value).forEach(walk);
      }
    };
    walk(nodes);
    const dangling = refs.filter((ref) => !ids.has(ref));
    check(`no dangling @id references on ${route}`, dangling.length === 0, dangling.join(', '));

    // Every absolute URL in the graph must be on the canonical origin or an
    // outbound profile — never a localhost or relative leftover.
    const urls = JSON.stringify(nodes).match(/"https?:\/\/[^"]+"/g) ?? [];
    const local = urls.filter((u) => u.includes('localhost') || u.includes('127.0.0.1'));
    check(`no localhost URLs leaked into the graph on ${route}`, local.length === 0, local.join(', '));

    const pageNode = nodes.find((n) => String(n['@id']).endsWith('#page'));
    check(`the page node names this URL on ${route}`, pageNode?.url === expected, pageNode?.url ?? 'missing');

    if (route !== '/') {
      const crumbs = nodes.find((n) => n['@type'] === 'BreadcrumbList');
      const last = crumbs?.itemListElement?.at(-1);
      check(`breadcrumbs end at this URL on ${route}`, last?.item === expected, last?.item ?? 'missing');
      check(
        `breadcrumb positions are sequential on ${route}`,
        crumbs?.itemListElement?.every((s, i) => s.position === i + 1) === true,
      );
    }
  }

  // The person node: the part that decides whether search engines can tell
  // who this is.
  await page.goto('http://localhost:4321/', { waitUntil: 'load' });
  const person = await page.evaluate(() => {
    const g = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
    return g['@graph'].find((n) => n['@type'] === 'Person');
  });
  for (const field of ['name', 'url', 'image', 'jobTitle', 'description', 'address', 'sameAs', 'worksFor', 'alumniOf', 'knowsAbout']) {
    check(`person node has ${field}`, Boolean(person[field]));
  }
  check('person links all three profiles', person.sameAs.length === 3, person.sameAs.join(' '));
  check(
    'person profile links are absolute https',
    person.sameAs.every((u) => u.startsWith('https://')),
    person.sameAs.join(' '),
  );
  check('home page is typed as a profile', await page.evaluate(() => {
    const g = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
    return g['@graph'].some((n) => n['@type'] === 'ProfilePage');
  }));

  // Publications: every paper in the list has to be in the graph, with its DOI.
  await page.goto('http://localhost:4321/publications/', { waitUntil: 'load' });
  const papers = await page.evaluate(() => {
    const g = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
    const nodes = g['@graph'].filter((n) => n['@type'] === 'ScholarlyArticle');
    const list = g['@graph'].find((n) => n['@type'] === 'ItemList');
    return {
      count: nodes.length,
      rendered: document.querySelectorAll('.pub').length,
      listed: list?.itemListElement?.length ?? 0,
      numberOfItems: list?.numberOfItems ?? 0,
      complete: nodes.every((n) => n.name && n.author?.length && n.datePublished && n.isPartOf?.name),
      withDoi: nodes.filter((n) => n.identifier?.propertyID === 'DOI').length,
      withUrl: nodes.filter((n) => n.url).length,
      // What the page itself shows, so the graph is compared against the page
      // rather than against a number that goes stale when a paper is added.
      doisOnPage: document.querySelectorAll('.cite__doi').length,
      linksOnPage: document.querySelectorAll('.cite__link').length,
      absolute: nodes.filter((n) => n.url).every((n) => n.url.startsWith('https://')),
    };
  });
  check('every rendered paper is in the graph', papers.count === papers.rendered, `${papers.count} vs ${papers.rendered}`);
  check('the item list matches the papers', papers.listed === papers.count && papers.numberOfItems === papers.count, `${papers.listed}/${papers.numberOfItems}`);
  check('every paper has title, authors, year and venue', papers.complete);
  check(
    'the graph carries a DOI for every paper that shows one',
    papers.withDoi === papers.doisOnPage,
    `${papers.withDoi} in graph, ${papers.doisOnPage} on page`,
  );
  check(
    'the graph links every paper the page links',
    papers.withUrl === papers.linksOnPage,
    `${papers.withUrl} in graph, ${papers.linksOnPage} on page`,
  );
  check('paper links are absolute', papers.absolute);

  // A post: the article metadata social and search both read.
  await page.goto('http://localhost:4321/blog/reconciliation-is-a-feature/', { waitUntil: 'load' });
  const article = await page.evaluate(() => {
    const g = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
    const post = g['@graph'].find((n) => n['@type'] === 'BlogPosting');
    const meta = (prop) => document.querySelector(`meta[property="${prop}"]`)?.content ?? '';
    return {
      post,
      ogType: meta('og:type'),
      published: meta('article:published_time'),
      tags: [...document.querySelectorAll('meta[property="article:tag"]')].map((m) => m.content),
      ogImage: meta('og:image'),
    };
  });
  check('post is typed as a BlogPosting', article.post?.['@type'] === 'BlogPosting');
  check(
    'post carries headline, dates, author and word count',
    Boolean(article.post?.headline && article.post?.datePublished && article.post?.dateModified && article.post?.author && article.post?.wordCount),
  );
  check('og:type is article on a post', article.ogType === 'article', article.ogType);
  check('article:published_time is set', /^\d{4}-\d{2}-\d{2}T/.test(article.published), article.published);
  check('article tags are emitted', article.tags.length === 2, article.tags.join(','));
  check(
    'the post has its own social card',
    article.ogImage.endsWith('/og/reconciliation-is-a-feature.png'),
    article.ogImage,
  );
  // The default alt describes the portrait, which a post's card does not show.
  const cardAlt = await page.evaluate(
    () => document.querySelector('meta[property="og:image:alt"]')?.content ?? '',
  );
  check(
    "the post card's alt text describes the post",
    cardAlt.startsWith('Reconciliation is a product feature'),
    cardAlt,
  );

  // Social cards must actually exist, or every share shows a broken image.
  for (const card of ['/og.png', '/og/reconciliation-is-a-feature.png']) {
    const res = await page.request.get(`http://localhost:4321${card}`);
    check(`social card ${card} is served`, res.status() === 200, String(res.status()));
  }

  // Internal links must not point at a URL the host would redirect. On GitHub
  // Pages a directory route without its trailing slash costs a 301.
  for (const route of ROUTES) {
    await page.goto(`http://localhost:4321${route}`, { waitUntil: 'load' });
    const slashless = await page.evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href'))
        .filter((href) => /^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/i.test(href) && !/\.[a-z0-9]+$/i.test(href)),
    );
    check(`no internal link skips its trailing slash on ${route}`, slashless.length === 0, slashless.join(', '));
  }

  await ctx.close();
}

// --- citation figures are attributed to where they came from -------------
// The numbers are fetched from OpenAlex, not Google Scholar, which has no API.
// Saying "Google Scholar" over an OpenAlex figure would be a false citation of
// a source, so the attribution is read from the data rather than written out.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const scholar = parseYaml(readFileSync('src/content/scholar.yaml', 'utf8')).main;

  for (const route of ['/publications/', '/cv/']) {
    await page.goto(`http://localhost:4321${route}`, { waitUntil: 'load' });
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
    const claim = text.match(/Citations and h-index are from ([^,]+), read ([^.]+)\./);
    check(`${route} says where the figures came from`, Boolean(claim), claim?.[0] ?? 'no attribution found');
    if (!claim) continue;
    check(
      `${route} names the source in the data, not a hardcoded one`,
      claim[1].trim() === scholar.source.name,
      `page says "${claim[1].trim()}", data says "${scholar.source.name}"`,
    );
    check(
      `${route} does not credit the figures to Google Scholar`,
      !/^Google Scholar/.test(claim[1].trim()),
      claim[1].trim(),
    );
    check(`${route} dates the figures`, claim[2].trim().length > 0, claim[2]);
  }
  await ctx.close();
}

// --- interview prep and blog series --------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4321/interview-prep/', { waitUntil: 'networkidle' });

  const prep = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent?.trim() ?? '',
    formats: [...document.querySelectorAll('.fmt__t')].map((el) => el.textContent.trim()),
    fitLists: document.querySelectorAll('.fit__l').length,
    fitItems: document.querySelectorAll('.fit__l li').length,
    steps: document.querySelectorAll('.steps__row').length,
    cvLink: !!document.querySelector('a[href="/cv/"]'),
  }));

  check('interview prep page has its heading', prep.h1.length > 0, prep.h1);
  check('all four session formats render', prep.formats.length === 4, prep.formats.join(', '));
  check('the fit section states both sides', prep.fitLists === 2 && prep.fitItems >= 6, `${prep.fitLists} lists, ${prep.fitItems} items`);
  check('the process steps render', prep.steps === 4, String(prep.steps));
  check('the page links the CV for its claims', prep.cvLink);

  // Booking must be usable in whichever state it is in. Which state that is
  // depends on whether a calendar is configured in prep.yaml, so these checks
  // establish the state first and then hold it to that state's contract.
  const booking = await page.evaluate(() => {
    // data-booking-block marks the block in both states; data-booking-mount
    // exists only where a calendar is configured to load into it.
    const root = document.querySelector('[data-booking-block]');
    const mount = root?.querySelector('[data-booking-mount]');
    return {
      present: !!root,
      configured: !!mount,
      types: [...(root?.querySelectorAll('a[data-cal-link]') ?? [])].map((a) => ({
        href: a.getAttribute('href'),
        calLink: a.dataset.calLink,
        current: a.getAttribute('aria-current'),
      })),
      mountLink: mount?.dataset.calLink ?? null,
      mountAnchor: mount?.querySelector('a')?.getAttribute('href') ?? null,
      mountText: mount?.textContent.replace(/\s+/g, ' ').trim() ?? '',
      cta: [...(root?.querySelectorAll('.btn') ?? [])].map((a) => ({
        href: a.getAttribute('href') ?? '',
        text: a.textContent.trim(),
        tag: a.tagName,
      })),
    };
  });

  check('the booking block renders', booking.present);

  // The bug this guards against: a call to action labelled for a calendar,
  // pointing at a section that has no calendar in it. Whichever state the site
  // is in, the lead button has to lead somewhere that keeps its promise.
  const lead = await page.evaluate(() => {
    const a = document.querySelector('.head__cta a');
    const href = a?.getAttribute('href') ?? '';
    const target = href.startsWith('#') ? document.querySelector(href) : null;
    return {
      href,
      text: a?.textContent?.trim() ?? '',
      isButton: a?.classList.contains('btn') ?? false,
      targetExists: href.startsWith('#') ? !!target : null,
      targetHasCalendar: target ? !!target.querySelector('[data-booking-mount]') : null,
    };
  });
  check('the page leads with a real button', lead.isButton && lead.href.length > 0, JSON.stringify(lead));
  if (lead.href.startsWith('#')) {
    check('the lead button jumps to a section that exists', lead.targetExists === true, lead.href);
    check(
      'a lead button that offers a time jumps to an actual calendar',
      lead.targetHasCalendar === true,
      JSON.stringify(lead),
    );
  } else {
    check(
      'with no calendar, the lead button is the email itself rather than a scroll',
      lead.href.startsWith('mailto:'),
      lead.href,
    );
    check(
      'the lead button does not offer a time it cannot give',
      !/pick a time|choose a time|book a time/i.test(lead.text),
      lead.text,
    );
  }
  check(
    'every booking action is a real anchor with a destination',
    booking.cta.length > 0 && booking.cta.every((c) => c.tag === 'A' && c.href.length > 0),
    JSON.stringify(booking.cta.map((c) => c.href)),
  );

  if (booking.configured) {
    // Configured: a working link to the same booking page must be in the markup
    // before any script runs, because the inline calendar may never load.
    check(
      'the calendar panel ships a real Cal.com link',
      booking.mountAnchor?.startsWith('https://') === true,
      booking.mountAnchor ?? 'missing',
    );
    check('the panel names the calendar to load', Boolean(booking.mountLink), booking.mountLink ?? 'missing');
    check(
      'the panel is not an empty box before scripting',
      booking.mountText.length > 0,
      booking.mountText.slice(0, 60),
    );
    // The chooser is only rendered where the formats resolve to more than one
    // calendar. Running every format through a single shared event is a
    // supported setup, and there it is correctly absent.
    if (booking.types.length > 0) {
      check(
        'session types are links, not dead buttons',
        booking.types.every((t) => t.href?.startsWith('https://')),
        JSON.stringify(booking.types.map((t) => t.href)),
      );
      check(
        'exactly one session type starts selected',
        booking.types.filter((t) => t.current === 'true').length === 1,
        JSON.stringify(booking.types.map((t) => t.current)),
      );
      check(
        'every session type names a distinct calendar',
        new Set(booking.types.map((t) => t.calLink)).size === booking.types.length,
        JSON.stringify(booking.types.map((t) => t.calLink)),
      );
    } else {
      check(
        'with one shared event, no chooser is offered',
        booking.types.length === 0 && Boolean(booking.mountLink),
        booking.mountLink ?? 'no calendar named',
      );
    }
    check(
      'the booking action says where it goes',
      booking.cta.some((c) => /Cal\.com/.test(c.text)),
      booking.cta.map((c) => c.text).join(' | '),
    );
  } else {
    // Not configured: nothing to embed, so the offer falls back to the real
    // email address rather than to a dead button.
    check(
      'with no calendar configured, booking falls back to email',
      booking.cta.every((c) => c.href.startsWith('mailto:')),
      JSON.stringify(booking.cta.map((c) => c.href)),
    );
    check(
      'the email fallback says what it does',
      booking.cta.every((c) => /Email/i.test(c.text)),
      booking.cta.map((c) => c.text).join(' | '),
    );
    const markup = await page.content();
    check('no third-party calendar script is referenced when unconfigured', !markup.includes('cal.com'));
  }

  // The Service node: what makes a free offer legible to a search engine.
  const service = await page.evaluate(() => {
    const g = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
    return g['@graph'].find((n) => n['@type'] === 'Service');
  });
  check('the offer is described as a Service', Boolean(service));
  check('the Service names the person as provider', service?.provider?.['@id']?.endsWith('#person') === true, service?.provider?.['@id']);
  check('the Service is priced at zero', service?.offers?.price === 0, JSON.stringify(service?.offers));
  check(
    'the Service catalogue matches the formats on the page',
    service?.hasOfferCatalog?.itemListElement?.length === prep.formats.length,
    `${service?.hasOfferCatalog?.itemListElement?.length} vs ${prep.formats.length}`,
  );

  // Nav: the new entry exists and marks itself current on its own page.
  const nav = await page.evaluate(() => ({
    hrefs: [...document.querySelectorAll('nav a')].map((a) => a.getAttribute('href')),
    current: document.querySelector('nav a[aria-current="page"]')?.getAttribute('href') ?? '',
  }));
  check('nav links interview prep', nav.hrefs.includes('/interview-prep/'), nav.hrefs.join(' '));
  check('nav marks interview prep current on its page', nav.current === '/interview-prep/', nav.current);

  // The home page points at it without leading with it: after the writing.
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  const order = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('section[id]')].map((s) => s.id);
    return { ids, hasLink: !!document.querySelector('a[href="/interview-prep/"]') };
  });
  check('home page links interview prep', order.hasLink);
  check(
    'the interview prep block sits after the work and the writing',
    order.ids.indexOf('prep') > order.ids.indexOf('work') &&
      order.ids.indexOf('prep') > order.ids.indexOf('publications'),
    order.ids.join(' > '),
  );

  // A series with no published post must not exist as a page or a link. It
  // would be an empty shell to land on and an empty page to index.
  const built = (await readdir('dist', { recursive: true })).filter((n) => n.endsWith('index.html'));
  const html = built.map((n) => readFileSync(`dist/${n}`, 'utf8')).join('\n');
  const seriesKeys = [...(await readFile('src/content/series.yaml', 'utf8')).matchAll(/^([a-z0-9-]+):$/gm)].map((m) => m[1]);
  check('series are declared in content', seriesKeys.length >= 2, seriesKeys.join(', '));
  for (const key of seriesKeys) {
    const page = built.includes(`blog/series/${key}/index.html`);
    const linked = html.includes(`/blog/series/${key}/`);
    // Either it has posts and is both built and linked, or it has neither.
    check(
      `series "${key}" is built exactly when something links it`,
      page === linked,
      `built=${page} linked=${linked}`,
    );
  }

  await ctx.close();
}

// --- sitemap and robots --------------------------------------------------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const robots = await (await page.request.get('http://localhost:4321/robots.txt')).text();
  check('robots.txt allows crawling', /Allow:\s*\//.test(robots), robots.split('\n')[1]);
  // The CV is published twice; only the page should be indexed.
  check('robots.txt keeps the CV PDF out of the index', /Disallow:\s*\/cv\.pdf/.test(robots), robots);
  check(
    'robots.txt points at this site\'s sitemap',
    robots.includes(`Sitemap: ${SITE}/sitemap-index.xml`),
    robots.split('\n').find((line) => line.startsWith('Sitemap:')) ?? 'no Sitemap line',
  );

  const xml = await (await page.request.get('http://localhost:4321/sitemap-0.xml')).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const mods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);

  // Compared against the canonicals the build emitted, so adding a route
  // cannot quietly leave it out of the sitemap.
  const canonicals = new Set(
    (await readdir('dist', { recursive: true }))
      .filter((name) => name.endsWith('index.html'))
      .map((name) => readFileSync(`dist/${name}`, 'utf8').match(/<link rel="canonical" href="([^"]+)"/)?.[1])
      .filter(Boolean),
  );
  const missing = [...canonicals].filter((href) => !locs.includes(href));
  const extra = locs.filter((loc) => !canonicals.has(loc));
  check('sitemap lists every page the build produced', missing.length === 0, missing.join(' '));
  check('sitemap lists nothing the build did not produce', extra.length === 0, extra.join(' '));
  check('sitemap is not empty', locs.length > 0, `${locs.length} urls`);
  check(
    'sitemap urls all use the directory form',
    locs.every((loc) => loc.endsWith('/')),
    locs.filter((loc) => !loc.endsWith('/')).join(' '),
  );
  // Not every url is required to carry a lastmod: a route whose content has no
  // commit yet is deliberately left undated rather than given a false date.
  check('the lastmod mechanism is producing dates', mods.length > 0, `${mods.length}/${locs.length}`);
  check(
    'lastmod dates are valid and in the past',
    mods.every((m) => !Number.isNaN(Date.parse(m)) && Date.parse(m) <= Date.now()),
    mods.join(' '),
  );
  // The point of dating from git: every lastmod must be an actual commit time.
  // Stamping the build time would pass the checks above and fail this one.
  // Identical dates across routes are fine and often true — one commit to the
  // shared layout really does change every page.
  const commits = new Set(
    execFileSync('git', ['log', '--format=%cI'], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((iso) => Date.parse(iso)),
  );
  const invented = mods.filter((m) => !commits.has(Date.parse(m)));
  check('every lastmod is a real commit date', invented.length === 0, invented.join(' '));

  // Each canonical the pages declare must be a URL the sitemap offers.
  for (const loc of locs) {
    const res = await page.request.get(loc.replace(SITE, 'http://localhost:4321'));
    check(`sitemap url ${new URL(loc).pathname} is served`, res.status() === 200, String(res.status()));
  }
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

/** Behavioural and responsive checks that a11y/Lighthouse do not cover. */
import { chromium } from 'playwright';
import { serve, launch } from './lib.mjs';

const server = await serve();
const browser = await launch(chromium);
const results = [];
const check = (name, pass, detail = '') => results.push({ check: name, pass: pass ? 'ok' : 'FAIL', detail });

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
    Array.from(document.images).map((i) => ({
      alt: i.getAttribute('alt'),
      loaded: i.complete && i.naturalWidth > 0,
      dims: Boolean(i.getAttribute('width') && i.getAttribute('height')),
    })),
  );
  check('every image has an alt attribute', imgs.every((i) => i.alt !== null), JSON.stringify(imgs.map((i) => i.alt)));
  check('every image actually loads', imgs.every((i) => i.loaded), `${imgs.filter((i) => !i.loaded).length} broken`);
  check('portrait declares width and height', imgs.every((i) => i.dims));

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

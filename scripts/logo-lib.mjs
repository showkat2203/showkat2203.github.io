import { chromium } from 'playwright';
import { launch } from './lib.mjs';

/**
 * Strips anything an inlined SVG has no business carrying.
 *
 * These files come from outside the repo and are injected into the page, so an
 * embedded <script>, an inline event handler, or a remote reference would run
 * with the site's origin. Structural attributes go too: fixed width/height stop
 * the tile sizing the mark, and a <title> would be read out over the name that
 * already sits beside it.
 */
export function sanitiseSvg(source) {
  let svg = source
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<(animate|animateTransform|animateMotion|set)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<metadata>[\s\S]*?<\/metadata>/gi, '')
    .trim();

  // Remote references (xlink:href / href to http(s)) would leak requests.
  svg = svg.replace(/\s(?:xlink:)?href\s*=\s*"(https?:)?\/\/[^"]*"/gi, '');

  const first = svg.indexOf('<svg');
  if (first > 0) svg = svg.slice(first);
  if (!svg.startsWith('<svg')) throw new Error('not an SVG');

  // Drop width/height from the root element only, so the tile can size the
  // mark. Stripping them everywhere would blank out any logo drawn with
  // <rect>, since those need their own dimensions.
  const close = svg.indexOf('>');
  const root = svg
    .slice(0, close)
    .replace(/\s(width|height)="[^"]*"/gi, '')
    .replace(/<svg/, '<svg aria-hidden="true" focusable="false"');
  return root + svg.slice(close);
}

/**
 * Rewrites each SVG's viewBox to its measured ink bounds.
 *
 * Icon sets and brand kits store marks in whatever canvas they were drawn on,
 * so a wide wordmark often arrives as a thin band inside a lot of empty space
 * and shrinks to nothing once the tile sizes it by height.
 */
export async function fitViewBoxes(entries) {
  const browser = await launch(chromium);
  const page = await browser.newPage();
  const results = [];

  for (const { name, svg } of entries) {
    const box = await page.evaluate((text) => {
      document.body.innerHTML = text;
      const el = document.querySelector('svg');
      if (!el) return null;
      el.setAttribute('width', '512');
      el.setAttribute('height', '512');
      const b = el.getBBox();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    }, svg);

    if (!box || box.width <= 0 || box.height <= 0) {
      results.push({ name, svg, fitted: false });
      continue;
    }

    const pad = Math.max(box.width, box.height) * 0.02;
    const vb = [box.x - pad, box.y - pad, box.width + pad * 2, box.height + pad * 2]
      .map((n) => Math.round(n * 100) / 100)
      .join(' ');
    const out = /viewBox="[^"]*"/.test(svg)
      ? svg.replace(/viewBox="[^"]*"/, `viewBox="${vb}"`)
      : svg.replace(/<svg/, `<svg viewBox="${vb}"`);
    results.push({ name, svg: out, fitted: true, viewBox: vb, ratio: box.width / box.height });
  }

  await browser.close();
  return results;
}

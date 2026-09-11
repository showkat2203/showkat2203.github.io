import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

/**
 * Give every off-site link its own tab.
 *
 * Done once over the built HTML rather than at each call site, so hand-written
 * pages, rendered Markdown, and generated markup all get the same treatment and
 * a new link cannot forget to opt in.
 *
 * Internal navigation is deliberately left alone: a nav or an anchor that
 * spawned a tab would read as a bug, and it would strand the reader's back
 * button. "Off-site" means an absolute http(s) URL to another origin.
 *
 * Each rewritten link also gets `rel="noopener noreferrer"` and a visually
 * hidden note, because a link that changes context without saying so is a
 * WCAG 3.2.5 failure for anyone who cannot see the new tab appear.
 */

const NOTE = '<span class="sr-only"> (opens in a new tab)</span>';

/** Anchors cannot nest, so the next `</a>` after an `<a` is always its own. */
export function rewriteOutbound(html, { site, note = NOTE } = {}) {
  const origin = site ? new URL(site).origin : null;
  let out = '';
  let at = 0;
  let rewritten = 0;

  for (;;) {
    const open = html.indexOf('<a ', at);
    if (open === -1) break;
    const openEnd = html.indexOf('>', open);
    const close = html.indexOf('</a>', openEnd);
    if (openEnd === -1 || close === -1) break;

    const tag = html.slice(open, openEnd + 1);
    const href = tag.match(/\shref="([^"]*)"/)?.[1];
    const external =
      href !== undefined &&
      /^https?:\/\//i.test(href) &&
      !/\starget=/i.test(tag) &&
      (() => {
        try {
          return !origin || new URL(href).origin !== origin;
        } catch {
          return false;
        }
      })();

    if (!external) {
      out += html.slice(at, close + 4);
      at = close + 4;
      continue;
    }

    const rel = tag.match(/\srel="([^"]*)"/);
    const wanted = new Set([...(rel ? rel[1].split(/\s+/) : []), 'noopener', 'noreferrer']);
    const relAttr = ` rel="${[...wanted].filter(Boolean).join(' ')}"`;
    const withTarget = (rel ? tag.replace(rel[0], relAttr) : tag.replace(/>$/, `${relAttr}>`)).replace(
      />$/,
      ' target="_blank">',
    );

    out += html.slice(at, open) + withTarget + html.slice(openEnd + 1, close) + note + '</a>';
    at = close + 4;
    rewritten += 1;
  }

  return { html: out + html.slice(at), rewritten };
}

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (extname(entry.name) === '.html') yield path;
  }
}

/** @returns {import('astro').AstroIntegration} */
export default function outboundLinks() {
  /** Set from the resolved config, so the canonical origin is stated once. */
  let site;

  return {
    name: 'outbound-links',
    hooks: {
      'astro:config:done': ({ config }) => {
        site = config.site;
      },
      'astro:build:done': async ({ dir, logger }) => {
        let total = 0;
        let files = 0;
        for await (const path of htmlFiles(dir.pathname)) {
          const before = await readFile(path, 'utf8');
          const { html, rewritten } = rewriteOutbound(before, { site });
          if (!rewritten) continue;
          await writeFile(path, html);
          total += rewritten;
          files += 1;
        }
        logger.info(`${total} outbound link(s) across ${files} page(s) now open in a new tab`);
      },
    },
  };
}

// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import outboundLinks from './src/integrations/outbound-links.mjs';
import { lastmodFor } from './scripts/lastmod.mjs';

// chy.io is canonical; the showkat2203.github.io address redirects to it
// via the CNAME in public/. Base stays at the root because this repo is a
// GitHub Pages *user* site, not a project site.
export default defineConfig({
  site: 'https://chy.io',
  // Directory form everywhere: GitHub Pages serves /cv/ and 301s /cv to it, so
  // canonical, the sitemap and every internal link use the slash.
  trailingSlash: 'always',
  build: { inlineStylesheets: 'always' },
  compressHTML: true,
  markdown: {
    // Both themes were measured against their own backgrounds, as rendered.
    // github-light clears AA at 4.57 (keyword). For dark: github-dark's
    // comment is 3.05, and vitesse-dark looks fine on paper at 4.79 but ships
    // alpha-suffixed colours (#758575DD) that blend down below AA, so
    // catppuccin-mocha is used instead — opaque, and 5.81 at its worst.
    shikiConfig: {
      themes: { light: 'github-light', dark: 'catppuccin-mocha' },
      defaultColor: false,
      wrap: false,
    },
  },
  integrations: [
    // changefreq and priority are omitted on purpose: Google ignores both, and
    // an ignored field is noise. lastmod comes from git — see scripts/lastmod.
    sitemap({
      serialize: (item) => {
        const lastmod = lastmodFor(new URL(item.url).pathname);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
    outboundLinks(),
  ],
});

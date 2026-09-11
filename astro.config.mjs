// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// chy.io is canonical; the showkat2203.github.io address redirects to it
// via the CNAME in public/. Base stays at the root because this repo is a
// GitHub Pages *user* site, not a project site.
export default defineConfig({
  site: 'https://chy.io',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'always' },
  compressHTML: true,
  markdown: {
    // github-light clears AA on white (keyword 4.57, comment 4.82) but not on
    // the warm tint, so code blocks are painted white in global.css.
    shikiConfig: { theme: 'github-light', wrap: false },
  },
  integrations: [sitemap()],
});

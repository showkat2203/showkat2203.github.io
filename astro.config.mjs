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
  integrations: [sitemap()],
});

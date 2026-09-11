/** Runs axe-core against every route at desktop and 360px. */
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { serve, launch } from './lib.mjs';

const server = await serve();
const browser = await launch(chromium);
let failures = 0;

// Directory form: these are the URLs the site actually serves and declares
// canonical, so they are the ones worth auditing.
for (const path of ['/', '/publications/', '/cv/', '/blog/', '/blog/reconciliation-is-a-feature/']) {
  for (const width of [1280, 360]) {
    for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
    const page = await context.newPage();
    await page.goto(`http://localhost:4321${path}`, { waitUntil: 'networkidle' });
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const label = `${path} @ ${width} ${scheme}`;
    if (violations.length === 0) {
      console.log(`ok    ${label}`);
    } else {
      failures += violations.length;
      console.log(`FAIL  ${label}`);
      for (const v of violations) {
        console.log(`      [${v.impact}] ${v.id}: ${v.help}`);
        for (const n of v.nodes.slice(0, 3)) console.log(`        ${n.target.join(' ')}`);
      }
    }
    await context.close();
    }
  }
}

await browser.close();
server.close();
process.exit(failures ? 1 : 0);

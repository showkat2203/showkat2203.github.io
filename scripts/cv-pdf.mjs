/**
 * Renders /cv to public/cv.pdf using the page's own print styles, so the PDF
 * and the web CV can never drift apart. Commit the result.
 *
 *   npm run build && npm run cv:pdf
 *
 * Needs a Chromium: `npx playwright install chromium`, or set CHROME_PATH.
 */
import { chromium } from 'playwright';
import { serve, launch } from './lib.mjs';

const server = await serve();
const browser = await launch(chromium);
const page = await browser.newPage();
await page.goto('http://localhost:4321/cv', { waitUntil: 'networkidle' });
await page.emulateMedia({ media: 'print' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: 'public/cv.pdf',
  format: 'Letter',
  printBackground: false,
  margin: { top: '16mm', bottom: '16mm', left: '16mm', right: '16mm' },
});
await browser.close();
server.close();
console.log('wrote public/cv.pdf');

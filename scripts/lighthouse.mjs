/** Lighthouse against the built site. Reports real scores, mobile profile. */
import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import { serve, launch } from './lib.mjs';

const server = await serve();
const browser = await launch(chromium, ['--remote-debugging-port=9222']);
const page = await browser.newPage();
await page.goto('http://localhost:4321/');

const results = [];
for (const path of ['/', '/publications', '/cv', '/blog']) {
  const r = await lighthouse(`http://localhost:4321${path}`, {
    port: 9222,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  });
  const c = r.lhr.categories;
  results.push({
    path,
    performance: Math.round(c.performance.score * 100),
    accessibility: Math.round(c.accessibility.score * 100),
    bestPractices: Math.round(c['best-practices'].score * 100),
    seo: Math.round(c.seo.score * 100),
  });
}
console.table(results);
await browser.close();
server.close();
const worstPerf = Math.min(...results.map((r) => r.performance));
process.exit(worstPerf >= 90 ? 0 : 1);

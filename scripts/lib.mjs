import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
};

/** Serve a built directory so Chromium can load the real pages and fonts. */
export function serve(root = 'dist', port = 4321) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = join(root, path);
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    } catch {
      if (!extname(file)) file = join(root, path, 'index.html');
    }
    // Read before writing headers, or a missing file leaves a 200 half-sent.
    let body;
    try {
      body = await readFile(file);
    } catch {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

/**
 * Chromium for PDF and image generation. CHROME_PATH wins; otherwise fall back
 * to whatever Playwright installed (`npx playwright install chromium`).
 */
export async function launch(chromium, args = []) {
  const executablePath = process.env.CHROME_PATH;
  try {
    return await chromium.launch({ ...(executablePath ? { executablePath } : {}), args });
  } catch (err) {
    if (String(err).includes("Executable doesn't exist")) {
      throw new Error(
        'No Chromium found. Run `npx playwright install chromium`, or point ' +
          'CHROME_PATH at an existing Chrome or Chromium binary.',
      );
    }
    throw err;
  }
}

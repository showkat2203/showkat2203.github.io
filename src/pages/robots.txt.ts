import type { APIRoute } from 'astro';

/**
 * robots.txt, generated so the sitemap URL cannot name a different host than
 * the rest of the site. It was a static file in public/, which meant the domain
 * was written down twice and only one copy would have been updated on a move.
 */
export const GET: APIRoute = ({ site }) => {
  const origin = new URL('/', site).href.replace(/\/$/, '');
  const body = `User-agent: *
Allow: /

# The CV is published twice: as /cv/ and as the PDF that page links. Only the
# page should be indexed — a PDF that outranks it drops the reader into a file
# with no navigation, and the two competing for the same query helps neither.
Disallow: /cv.pdf

Sitemap: ${origin}/sitemap-index.xml
`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};

/**
 * Last-modified date per route, taken from git.
 *
 * A sitemap that stamps every URL with the build time tells crawlers the whole
 * site changed on every deploy, which is worse than saying nothing. So each
 * route is dated by the newest commit touching the files it actually renders,
 * and a route whose date cannot be established is left undated rather than
 * given a date that is not true.
 *
 * This needs real history: a shallow clone collapses every file onto one
 * commit, so CI checks out with fetch-depth 0.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const CONTENT = 'src/content';

/** Files behind each static route. */
const ROUTES = {
  '/': [
    'src/pages/index.astro',
    `${CONTENT}/profile.yaml`,
    `${CONTENT}/domains.yaml`,
    `${CONTENT}/work.yaml`,
    `${CONTENT}/experience.yaml`,
    `${CONTENT}/publications.yaml`,
    `${CONTENT}/scholar.yaml`,
    `${CONTENT}/news.yaml`,
    `${CONTENT}/institutions.yaml`,
  ],
  '/publications/': [
    'src/pages/publications.astro',
    `${CONTENT}/publications.yaml`,
    `${CONTENT}/scholar.yaml`,
  ],
  '/cv/': [
    'src/pages/cv.astro',
    `${CONTENT}/cv.yaml`,
    `${CONTENT}/experience.yaml`,
    `${CONTENT}/skills.yaml`,
    `${CONTENT}/publications.yaml`,
    `${CONTENT}/scholar.yaml`,
    `${CONTENT}/profile.yaml`,
    `${CONTENT}/institutions.yaml`,
  ],
  '/blog/': ['src/pages/blog/index.astro', `${CONTENT}/blog`],
};

/** Newest committer date across `paths`, as an ISO string, or null. */
function newestCommit(paths) {
  const present = paths.filter((path) => existsSync(path));
  if (!present.length) return null;
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', ...present], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    // No git, no history, or an unborn branch: say nothing rather than guess.
    return null;
  }
}

/**
 * @param {string} pathname a route path, e.g. `/cv/`
 * @returns {Date | undefined} undefined when no date can be established
 */
export function lastmodFor(pathname) {
  const post = pathname.match(/^\/blog\/([^/]+)\/$/);
  const paths = post
    ? ['src/pages/blog/[...slug].astro', `${CONTENT}/blog/${post[1]}.md`]
    : ROUTES[pathname];
  if (!paths) return undefined;
  const iso = newestCommit(paths);
  return iso ? new Date(iso) : undefined;
}

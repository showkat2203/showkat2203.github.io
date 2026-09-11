# chy.io

Personal site for Md Showkat Hossain Chy. Astro, TypeScript, static output, no
client framework. Deployed to GitHub Pages at [chy.io](https://chy.io).

## Editing content

All content lives in `src/content/` as YAML. Components read it through typed
collections, so adding a publication or a role means editing one file and
nothing else. The schemas are in `src/content.config.ts`; a build fails loudly
if a required field is missing or misspelled.

| File | Holds |
| --- | --- |
| `profile.yaml` | Name, email, links, hero sentence, publication record |
| `domains.yaml` | The three bands on the magnitude rail |
| `work.yaml` | Selected work entries, each with its position on the rail |
| `experience.yaml` | Roles, with exact `start`/`end` dates and CV bullets |
| `publications.yaml` | All publications, newest first |
| `skills.yaml` | Technical range, grouped by magnitude band |
| `cv.yaml` | Education, service, teaching, background, languages |

To add a publication, copy any block in `publications.yaml`. Set
`headlineOrder` to 1–5 to surface it on the home page, or `null` to leave it on
`/publications` only. Fill `doi` or `url` and the entry links itself; while both
are `null` it renders a visible "link pending" note rather than a dead link.

Author names print exactly as written. Any name matching
`profile.selfAliases` is bolded automatically.

## Running it

```bash
npm install
npm run dev          # http://localhost:4321
```

```bash
npm run build        # static output in dist/
npm run preview      # serve the built site
```

## Deploying

Push to `main`. `.github/workflows/deploy.yml` builds the site and publishes it
to GitHub Pages.

```bash
git push origin main
```

One-time setup in the repository settings: set **Pages → Build and deployment →
Source** to **GitHub Actions**, and point `chy.io`'s DNS at GitHub Pages.
`public/CNAME` already claims the domain, and GitHub redirects
`showkat2203.github.io` to it.

For Netlify or Vercel instead: build command `npm run build`, publish
directory `dist`, no other configuration.

## Regenerating the CV PDF and the social card

Both are committed to `public/` and are only rebuilt when their source changes.
They need a Chromium — `npx playwright install chromium`, or set `CHROME_PATH`.

```bash
npm run build
npm run cv:pdf       # renders /cv through its print styles to public/cv.pdf
npm run og           # redraws public/og.png from the design tokens
```

The PDF is generated from the `/cv` page itself, so the two cannot drift apart.

## Checks

```bash
npm run audit        # typecheck, build, axe, behaviour, Lighthouse
```

Individually: `npm run check` (types), `npm run a11y` (axe-core on every route
at 1280px and 360px), `npm run verify` (no horizontal scroll from 320px,
keyboard focus, the publications filter, copy-to-clipboard, reduced motion,
and the no-JavaScript fallback), `npm run lighthouse`.

Last run: Lighthouse performance 99–100, accessibility 100, best practices 100,
SEO 100 across all three routes; zero axe violations; 23 of 23 behaviour checks
passing.

`npm run shots` writes screenshots to `.shots/` for design review.

## Still to fill in

Search the content files for `PLACEHOLDER`:

- Google Scholar and LinkedIn URLs in `profile.yaml`.
- DOIs or publisher links in `publications.yaml` (all twelve are `null`).
- A one-line description of the current role in `experience.yaml`.

`PROFILE-README.md` in this repo is the rewritten GitHub profile README; it
belongs in the `showkat2203/showkat2203` repository, not this one.

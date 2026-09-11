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
| `domains.yaml` | The three practice areas under "What I work on" |
| `work.yaml` | Selected work entries, each naming a diagram and its stack |
| `experience.yaml` | Roles, with exact `start`/`end` dates and CV bullets |
| `publications.yaml` | All publications, newest first |
| `skills.yaml` | Technical range, grouped |
| `cv.yaml` | Education, service, teaching, background, languages |
| `blog/*.md` | Blog posts, one Markdown file each |

To add a publication, copy any block in `publications.yaml`. Set
`headlineOrder` to 1–5 to surface it on the home page, or `null` to leave it on
`/publications` only. Fill `doi` or `url` and the entry links itself; while both
are `null` it renders a visible "link pending" note rather than a dead link. The
link text names the publisher, derived from the DOI's registrant prefix in
`src/components/Citation.astro` — add a prefix there if a new one appears.

Author names print exactly as written. Any name matching
`profile.selfAliases` is bolded automatically.

## Writing a post

Add a Markdown file to `src/content/blog/`. The filename becomes the URL, so
`reconciliation.md` is served at `/blog/reconciliation`.

```yaml
---
title: A title
description: One or two sentences, used on the card and in meta tags.
date: 2026-09-01
tags: [distributed systems]
draft: false   # true keeps it out of the build
---
```

Reading time is computed from the word count. Posts appear newest first on
`/blog`, the three most recent appear on the home page, and all of them go into
`/rss.xml`. Code blocks are highlighted with the `github-light` theme, chosen
because it clears WCAG AA on a white background.

## Diagrams

Each work entry names a diagram in `work.yaml` (`timing`, `reconcile`, `graph`,
or `pipeline`). The drawings live in `src/components/diagrams/` as plain SVG
that inherits the site's colours through CSS variables, so they restyle with the
theme and stay legible in print. To add one, drop a new component in that
directory, register it in the `diagrams` map in
`src/components/WorkCard.astro`, and add its name to the `diagram` enum in
`src/content.config.ts`. Give every drawing an `aria-label` that describes the
mechanism in a sentence.

## The CV

Three ways to offer it, configured under `cv:` in `profile.yaml`:

- `hosted` — the PDF committed at `public/cv.pdf`, generated from the `/cv` page
  by `npm run cv:pdf`. This one always works, needs no third party, and cannot
  drift from the page. It is the download button.
- `drive` — an optional Google Drive link. Useful if you would rather update the
  file without a commit; the tradeoff is that Drive links break when sharing
  permissions change, and the file is one more thing to keep in sync.
- `latex` — an optional Overleaf or repository link to the LaTeX source, for
  people who want the typeset original.

Fill either optional field and an extra button appears next to the download.
Both are `null` today, and the CV page says so rather than showing a dead link.

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
image alt text and loading, diagram labels, the blog and its feed, and the
no-JavaScript fallback), `npm run lighthouse`.

Last run: Lighthouse performance 95–100, accessibility 100, best practices 100,
SEO 100 across all four routes; zero axe violations at 1280px and 360px on five
routes; 27 of 27 behaviour checks passing.

Lighthouse reports one failure that is not actionable here — `bf-cache`, which
Chrome disables by command line in a headless container.

`npm run shots` writes screenshots to `.shots/` for design review.

## Design

One light theme, deliberately made rather than inverted into a dark variant.
Source Serif 4 carries identity and headings, Inter Tight carries anything read
at length, and DM Mono is reserved for figures, dates, and identifiers. Deep
navy `#1b3a6b` is the only accent; it appears on links, buttons, figures, and
diagram emphasis, and nowhere else. All four fonts are self-hosted and
subsetted, so the page makes no third-party requests.

## Still to fill in

Search the content files for `PLACEHOLDER`:

- LinkedIn URL in `profile.yaml`.
- Optional `cv.drive` and `cv.latex` URLs in `profile.yaml`.
- One link in `publications.yaml`: `segah-2023-bless` has no DOI or stable
  publisher page indexed, so it still renders "link pending".

Four entries in `publications.yaml` carry a `VERIFY` comment where the
publisher's record disagrees with the CV the content came from — the venue on
the ASE paper, the published title on the Cluster Computing paper, the author
list on the JSS paper, and the year and pages on the CCIS chapter. The CV's
wording was kept in each case; the DOIs resolve regardless.

`PROFILE-README.md` in this repo is the rewritten GitHub profile README; it
belongs in the `showkat2203/showkat2203` repository, not this one.

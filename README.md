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
| `institutions.yaml` | Employers and universities, with their monograms |
| `news.yaml` | The "Latest" entries on the home page |
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

## Institution marks

`institutions.yaml` holds each employer and university. They render as monogram
tiles in the site's own typography — uniform height, monochrome, one visual
system — in the credibility row under the hero and beside each role in the
timeline.

Logos resolve in three tiers, best first:

1. **A downloaded file** at `public/img/logos/<key>.svg` — inlined, so it can
   inherit type colour, is measured for optical sizing, and costs no
   third-party request.
2. **The `logoSource` URL**, loaded by the visitor's browser. This is what ships
   today: no files are committed, so all eight load from the URLs recorded in
   `institutions.yaml`.
3. **The monogram**, if there is no file and no URL — or if the URL fails, since
   the image removes itself on error and reveals the monogram underneath rather
   than a broken-image icon.

Tier 1 takes over automatically once a file lands, with no content change. The
trade-off of tier 2 is worth being explicit about: it depends on four
third-party hosts staying up and not blocking hotlinks, it leaks visitor IPs to
them, and it adds cross-origin requests to a page that otherwise makes none.
Run `npm run logos:fetch` when you want that gone.

To fetch them all, on a machine with network access:

```bash
npm run logos:fetch
```

That reads every `logoSource`, downloads the SVG, sanitises it, refits its
viewBox to the mark's ink bounds, and writes `public/img/logos/<key>.svg`. Add
`--mono` to flatten the marks to `currentColor` instead of keeping brand
colours. Failures are named individually with their URL, and the rest still
land, so one dead host does not cost you the other seven.

If you already downloaded the files some other way, import them instead:

```bash
npm run logos:import -- ~/portfolio_logos
```

Filenames in logo bundles rarely match this site's institution keys —
`university_of_arizona.svg` against `arizona`, `divine_it.svg` against
`divine-it` — and a mismatch fails **silently**, because the tile simply falls
back to a monogram. The importer matches each file against every institution's
key, name, and short name, sanitises and refits it, prints what landed where,
and lists anything it could not place rather than guessing.

Logos sit on a **white tile in both themes**, which is the ground brand marks
are drawn for; a dark wordmark would otherwise vanish on the dark palette.
Colours are kept as published. Institutions with no logo file render a monogram
in the site's own typography instead, so the row stays complete either way.

### How logos are sized

Every tile in the credibility row has the same footprint, and each mark is
scaled inside it by **optical area rather than by height**. Matching heights is
the obvious approach and the wrong one: at equal height a 6:1 wordmark carries
several times the visual weight of a square crest, which is what makes untuned
logo rows look ragged.

The scale comes from the fitted viewBox, so it is computed from the artwork and
needs no per-logo tuning — drop a file in and it lands at the right weight. The
exponent softens full area normalisation, which would shrink a wide wordmark
past readability, and a floor and a width cap keep every mark legible and
inside its box. Roughly what that yields:

| Aspect | Height | Width |
| --- | --- | --- |
| 1:1 | 18px | 18px |
| 2.5:1 | 12.5px | 31px |
| 4:1 | 10.3px | 41px |
| 6.5:1 | 10px | 65px |

The row itself is a grid rather than a wrapping flex line, so with uniform
tiles the columns align instead of leaving a ragged last row.

### Why the SVGs are sanitised

These files come from outside the repo and are inlined into the page, so
`scripts/logo-lib.mjs` strips `<script>`, inline `on*` handlers, remote
`href`/`src` references, animation elements, and `<title>`. It also removes
`width`/`height` **from the root element only** — stripping them everywhere
blanks out any logo drawn with `<rect>`, which is most institutional marks.
`npm run verify` asserts that contract directly, because a partly-stripped
logo still paints something and so renders without looking broken.

Only use marks you are entitled to use. Naming a past employer factually is
ordinary; redistributing a logo for other purposes is not.

## Latest news

`news.yaml`, newest first. The home page shows the four most recent. Set `href`
and `linkLabel` together to make an entry link somewhere, or leave both `null`
for a plain dated line.

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

## The portrait

`assets/portrait-source.png` is the original; `npm run portrait` crops it square
on the subject and writes the three webp sizes the hero's `srcset` asks for,
plus a jpeg for the few clients without webp.

The photograph is used as shot. Its own background serves both themes, so
nothing about the image is theme-dependent and the hero frame is just a
hairline border and a clip.

## Regenerating the CV PDF and the social card

Both are committed to `public/` and are only rebuilt when their source changes.
They need a Chromium — `npx playwright install chromium`, or set `CHROME_PATH`.

```bash
npm run build
npm run cv:pdf       # renders /cv through its print styles to public/cv.pdf
npm run og           # redraws public/og.png from the design tokens
npm run portrait     # rebuilds the hero portrait from assets/
npm run logos:fetch  # downloads every logoSource and normalises it
npm run logos        # refits logo viewBoxes after adding one by hand
npm run logos:preview # renders the logo rows with stand-ins, offline
```

The PDF is generated from the `/cv` page itself, so the two cannot drift apart.

## Checks

```bash
npm run audit        # typecheck, build, axe, behaviour, Lighthouse
```

Individually: `npm run check` (types), `npm run a11y` (axe-core on every route
at 1280px and 360px), `npm run verify` (no horizontal scroll from 320px,
keyboard focus, the publications filter, copy-to-clipboard, reduced motion,
image alt text and loading, diagram labels, the blog and its feed, the theme
toggle and its persistence, institution marks, and the no-JavaScript
fallback), `npm run lighthouse`.

Last run: Lighthouse performance 95–100, accessibility 100, best practices 100,
SEO 100 across all four routes; zero axe violations across five routes, two
widths, and both themes (20 combinations); 48 of 48 behaviour checks passing.

Lighthouse reports one failure that is not actionable here — `bf-cache`, which
Chrome disables by command line in a headless container.

`npm run shots` writes screenshots to `.shots/` for design review.

## Design

Source Serif 4 carries identity and headings, Inter Tight carries anything read
at length, and DM Mono is reserved for figures, dates, and identifiers. One
accent colour appears on links, buttons, figures, and diagram emphasis, and
nowhere else. All fonts are self-hosted and subsetted, so the page makes no
third-party requests.

Both themes are designed rather than inverted, and every colour is a token in
`src/styles/global.css`, including the ones the diagrams use. Three states: an
explicit choice stamps `data-theme` on the root element and persists in
`localStorage`; with nothing stored the page follows `prefers-color-scheme`. An
inline script in `<head>` applies a stored choice before first paint, so the
page never flashes the wrong palette. Measured contrast is recorded beside each
palette in the stylesheet.

Code blocks use `github-light` and `catppuccin-mocha`. Two dark themes were
rejected on measurement: `github-dark`, whose comment colour is 3.05:1, and
`vitesse-dark`, which looks fine at 4.79:1 until you notice its colours carry
alpha suffixes that blend down below AA.

## Case conventions

Position titles are Title Case, matching the résumé: "Software Development
Engineer, AWS Infrastructure Supply Chain". Everything else — section
headings, prose, link text — stays sentence case. Publication titles keep
whatever capitalisation the publisher used, because they are citations.

## Still to fill in

Search the content files for `PLACEHOLDER`:

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

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
| `profile.yaml` | Name, email, links, hero sentence |
| `prep.yaml` | The interview-prep offer, including the booking link |
| `series.yaml` | Blog series, for posts meant to be read in order |
| `scholar.yaml` | Citation count and h-index, with the date they were read |
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
`/publications` only. Fill `doi` or `url` and the entry links itself; with both
`null` the citation simply renders without a link. The link text names the
publisher, derived from the DOI's registrant prefix in
`src/components/Citation.astro` — add a prefix there if a new one appears.

Author names print exactly as written. Any name matching
`profile.selfAliases` is bolded automatically.

## Interview prep

`/interview-prep/` describes the free 30-minute sessions: the four formats, who
they are and are not for, how one runs, and where the credibility comes from.
All of the copy is in `prep.yaml`.

### Booking

Booking happens on the page. The visitor picks a session type, a date and a
time, writes what they want out of it, and gets a confirmation and a calendar
invite — without leaving the site. Cal.com's calendar is embedded inline;
Cal.com holds the availability and sends the mail, because doing either needs a
server and this site is static.

Configured in `prep.yaml` as `cal.com/showkat`, running all four formats through
one `30min` event. Two things to check on the Cal.com side:

- **The event slug.** `30min` is the 30-minute event a new account starts with.
  If it has been renamed, take the slug from the end of the event's booking URL
  and put it in `booking.calEvent`.
- **The notes field.** Turn on the **Additional notes** question on that event,
  or there is nowhere for the visitor to say what they want out of the session.

To offer the four formats as separate calendars instead, create an event type
per format and put each slug in that format's `calEvent`. The page then shows a
chooser above the calendar; with one shared event it does not, because there
would be nothing to choose between, and the format is named in the notes.

Three states, all of them working:

| State | What the visitor gets |
| --- | --- |
| No `calUser` | The real email address. No third-party script is loaded at all. |
| Configured, script blocked or failed | A real link to the same Cal.com booking page. |
| Configured, script runs | The calendar inline, no navigation. |

Every label follows the state, because a call to action has to be named for
where it actually leads. With a calendar, the page leads with "Pick a time"
jumping to it; without one there is nothing to pick, so the button is the email
itself rather than a scroll to a section that only repeats it. `src/lib/booking.ts`
decides the state once and both the page and the block read it, and `verify`
fails a lead button that offers a time it cannot give.

The third state is an upgrade of the second, never a replacement for it. That
distinction is the whole difficulty: installing the embed **never throws** — it
appends a script tag and queues instructions against it — so a blocked or
unreachable Cal.com produces no error, just instructions that never execute.
Removing the link up front and trusting a `try`/`catch` leaves an empty panel,
which is exactly the bug the checks caught. So the link stays until an iframe
actually appears, and if none does within the timeout the calendar is torn back
down and the link remains, with the reserved height given back.

The embed is fetched when the section nears the viewport rather than on load, so
a reader who never scrolls that far pays nothing for it. `/interview-prep/`
scores 100 on all four Lighthouse categories.

### How the calendar is dressed

Cal.com exposes its colours as CSS custom properties, so the calendar wears the
site's palette instead of arriving in its own. `booking.ts` reads the live
values off `:root` — `--bg`, `--tint`, `--rule`, `--ink`, `--sec`, `--navy` —
and hands them over as `cssVarsPerTheme`, so there is no second palette to keep
in step with `global.css`. It follows the theme toggle and the system
preference behind it, re-sending on every change. Both key spellings
(`cal-brand` and `--cal-brand`) are sent: the package ships the type for this
but not the code that reads it, so which one it wants could not be checked
here.

`hideEventTypeDetails` is on. The page already states the duration, the price
and who I am, in its own typography; Cal repeating it is duplication in a
second typeface.

The panel is not a card. This design separates things with hairline rules
rather than boxing them, and a framed panel is what makes an embed read as a
widget bolted on rather than part of the page. The reserved height sits on the
frame instead of the panel, so it is claimed only while a calendar is on its
way and given back if none arrives. The frame caps at 54rem — the shell runs to
72rem, which is wider than a month grid wants — and that cap is the one number
most likely to need adjusting once the real calendar is on screen.

One limit worth stating: the happy path could not be verified here, because
Cal.com is unreachable from this sandbox. The integration follows the documented
`@calcom/embed-snippet` and `embed-core` API, and the two degraded paths *are*
verified — the sandbox's blocked egress makes the failure case a real test
rather than a simulated one. Check the calendar renders once `calUser` is set.

## Writing a post

Add a Markdown file to `src/content/blog/`. The filename becomes the URL, so
`reconciliation.md` is served at `/blog/reconciliation/`.

To put a post in a series, add `series:` with a key from `series.yaml` and
`seriesOrder:` with its position:

```yaml
series: system-design
seriesOrder: 1
```

The post then shows which part of the series it is and links back to the series
index at `/blog/series/system-design/`, and the series appears on the writing
page and on the interview-prep page. Two series are declared and waiting for
their first post: `system-design` and `object-oriented-design`.

A series with no published post is not built, linked, or indexed anywhere —
there is no empty shell to land on, and adding a key to `series.yaml` costs
nothing until a post joins it. `verify` checks that a series is built exactly
when something links it.

Social cards are generated per post by `npm run og`, which is a separate step
from the build. A post published before that step runs falls back to the site
card rather than pointing at a missing image.

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
2. **The `logoSource` URL**, loaded by the visitor's browser. This is how the
   eight real company and university marks ship today: no files for them are
   committed, so each loads from the URL recorded in `institutions.yaml`.
3. **The monogram**, if there is no file and no URL — or if the URL fails, since
   the image removes itself on error and reveals the monogram underneath rather
   than a broken-image icon.

One mark is committed as a file: `stealth.svg`, drawn here for the stealth AI
startup, which has no public logo to link to. It is a single-colour drawing in
`currentColor` — stacked records, the lowest lifting away as a signal that
resolves to a point — with no detail below three units so it holds at the 13px
the timeline renders it at.

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

## Regenerating the CV PDF and the social cards

Both are committed to `public/` and are only rebuilt when their source changes.
They need a Chromium — `npx playwright install chromium`, or set `CHROME_PATH`.

```bash
npm run build
npm run cv:pdf       # renders /cv through its print styles to public/cv.pdf
npm run og           # redraws public/og.png and one card per post
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
at 1280px and 360px), `npm run verify` (structured data and head metadata on
every route, the sitemap and robots.txt, no horizontal scroll from 320px,
keyboard focus, the publications filter, copy-to-clipboard, reduced motion,
image alt text and loading, diagram labels, the blog and its feed, the theme
toggle and its persistence, institution marks, the motion layer in all three
of its states, the SVG sanitiser and outbound-link contracts, the research
record derivation, the interview-prep page, booking in whichever of its three
states is configured, blog series, and the no-JavaScript fallback),
`npm run lighthouse`.

Last run: Lighthouse performance 96–100, accessibility 100, best practices
96–100, SEO 100 across all five routes; zero axe violations across five routes,
two widths, and both themes (24 combinations); 278 of 278 behaviour checks
passing.

Best practices is 96 rather than 100 on `/` and `/cv/` only inside this sandbox,
where the eight logo hosts are unreachable: the console errors are the blocked
requests, and the pages score 100 where those hosts resolve. `/publications`
and `/blog` carry no logos and score 100 here.

Lighthouse reports one failure that is not actionable here — `bf-cache`, which
Chrome disables by command line in a headless container.

`npm run shots` writes screenshots to `.shots/` for design review.

## Changing the domain

The domain lives in exactly one place: `public/CNAME`. GitHub Pages requires
that file verbatim in the output, so `astro.config.mjs` reads it and derives
`site` from it, and everything else follows — canonical links, `og:url`, the
sitemap, the feed, the JSON-LD graph, `robots.txt`, and the checks.

It used to be written down in six places, three of them independent, so a move
would have left `robots.txt` advertising a sitemap on the old host and `verify`
asserting the old origin while every page had already changed. `robots.txt` is
now generated from `site` rather than sitting static in `public/`, and `verify`
imports the config instead of hardcoding the origin.

To move: edit `public/CNAME`, point the new domain's DNS at GitHub Pages, and
set the custom domain in the repository's Pages settings. Nothing else in the
source mentions the host.

## What search engines are told

Every page carries one `application/ld+json` block holding a `@graph`, built by
`src/lib/schema.ts` from the same collections the page renders — so it cannot
claim a paper or a role the visible page does not have. The `Person` and
`WebSite` are described once with stable `@id`s and referenced from each page's
own node, and each graph is self-contained: a bare `@id` reference always
resolves inside the document it appears in, which `verify` enforces.

| Route | Page node | Also in the graph |
| --- | --- | --- |
| `/` | `ProfilePage` → `Person` | — |
| `/publications/` | `CollectionPage` → `ItemList` | one `ScholarlyArticle` per paper, with its DOI as an `identifier` |
| `/cv/` | `WebPage` about the `Person` | breadcrumbs |
| `/blog/` | `Blog` | every post, described inline |
| `/blog/<slug>/` | `WebPage` → `BlogPosting` | the `Blog` it belongs to |
| `/blog/series/<slug>/` | `CollectionPage` → `CreativeWorkSeries` | each post in the series |
| `/interview-prep/` | `WebPage` → `Service` | a zero-price `Offer` and one per session format |

A conference paper's proceedings is modelled as a `CreativeWork` and a journal
issue as a `Periodical`, because only one of the two is genuinely periodical.
Only the year is known for every paper, and a bare year is valid ISO 8601.

URLs use the directory form — `/cv/`, not `/cv` — everywhere: canonical,
`og:url`, the sitemap, the feed, and every internal link. GitHub Pages serves
each route from its own `index.html` and 301s the slashless spelling to it, so
the old mixture meant internal links cost a redirect and canonical pointed at
one. `verify` fails on any internal link that drops the slash.

The offer is typed as a `Service` with a `price` of 0 rather than no price at
all, because a search engine reads zero as free and a missing price as unknown.

The CV is published twice, as `/cv/` and as the PDF that page links, so
`robots.txt` disallows `/cv.pdf`: a PDF that outranks the page drops the reader
into a file with no navigation, and the two competing for one query helps
neither.

`lastmod` in the sitemap comes from git: each route is dated by the newest
commit touching the files it renders (`scripts/lastmod.mjs`), and a route whose
date cannot be established is left undated rather than given a false one. This
needs real history, so CI checks out with `fetch-depth: 0` — a shallow clone
would collapse every file onto one commit. `changefreq` and `priority` are
omitted because Google ignores both.

Identical `lastmod` dates across routes are normal rather than a bug: one commit
to the shared layout really does change every page. What `verify` insists on is
that every `lastmod` matches an actual commit timestamp in this repository, which
is the check that stamping the build time would fail.

Each post gets its own social card at `public/og/<slug>.png`, generated by
`npm run og` alongside the site card, so a shared post shows its own title
rather than the same portrait every time.

## Links and motion

Every link that leaves the site opens in its own tab. That is applied once, to
the built HTML, by `src/integrations/outbound-links.mjs`, rather than at each
call site — so a hand-written page, a rendered Markdown post, and generated
markup all behave the same and a new link cannot forget to opt in. Each such
link also gets `rel="noopener noreferrer"` and a visually hidden "opens in a
new tab", because changing context without saying so fails WCAG 3.2.5.
Internal navigation deliberately stays in the same tab: a nav item that spawned
a tab would read as a bug and would strand the back button.

Motion is in `src/scripts/motion.ts` and the block at the end of
`global.css`. The page ships in its finished state and the layer only adds the
arrival, so it is gated on an `anim` class that the script adds — and never
adds when `prefers-reduced-motion: reduce` is set, in either direction, even if
the preference changes after load. With JavaScript off there is no reveal to
miss. The moves follow what the layout is made of: this design separates
sections with hairline rules, so the rules draw, the portrait's offset frame
slides out to its offset once, and the research figures count up to the numbers
already in the HTML. `verify` checks all three states.

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

## The research numbers

Nothing about the research record is typed out twice. The paper count and the
venue list are computed from `publications.yaml` by `src/lib/record.ts`, so
adding a paper updates the home page, `/publications`, `/cv`, and the meta
descriptions at once. Prose can use `{publications}`, `{citations}` and
`{hIndex}` — the tokens in `profile.yaml` are filled from the same record.

Citations and the h-index are the two figures that cannot be derived from the
content, so they are fetched.

**Not from Google Scholar.** Scholar has no API, has never had one, and blocks
automated access; the only ways to get its numbers are to scrape it, which
breaks its terms and gets CAPTCHA'd within days of running from CI, or to pay a
service that scrapes it. The figures come from
[OpenAlex](https://openalex.org) instead — an open REST API built to be queried
— and the page attributes them to OpenAlex rather than claiming a Scholar
figure it never got from Scholar. OpenAlex indexes less than Scholar, so the
numbers run lower; the page links the Scholar profile beside them and says so.

`npm run scholar` reads the OpenAlex author record and rewrites `scholar.yaml`
in place, keeping its comments. `--dry` reports without writing. The author id
is resolved once from the DOIs already in `publications.yaml`, printed so the
match can be eyeballed, then pinned in the file.

`.github/workflows/scholar.yml` runs it weekly, **builds the site before
committing anything**, commits only when a number actually moves, and then
explicitly dispatches the deploy — a `GITHUB_TOKEN` push does not start other
workflows, so without that step new figures would sit unpublished until the
next unrelated commit.

The build-before-commit step is there because the first synced value broke
`main`. The sync wrote `asOf: 2026-09-12` unquoted, YAML reads a bare date as a
`Date` rather than a string, the schema rejected it, and it reached `main` and
failed the deploy before anyone had built with it. The sync now quotes the
value and the schema normalises a `Date` either way, but the real fix is the
gate: a refresh the site cannot build never becomes a commit, and last week's
figures stand instead.

**The site never calls the API at page load.** The numbers are baked into the
build, so a failed fetch leaves last week's figures standing rather than
breaking a page or showing a spinner. `asOf` is printed beside them, gaining a
day of precision once the sync has run.

`perPublication` remains a manual override: fill it with a count per paper and,
once every paper has one, the total and h-index are computed from those and the
fetched aggregates are ignored.

## Optional extras

- `cv.drive` and `cv.latex` in `profile.yaml`: put a URL in either and a second
  link appears beside the CV download. The committed PDF always works, so
  neither is needed.
- `segah-2023-bless` in `publications.yaml` has no DOI or stable publisher page
  indexed, so it renders as a citation with no link. Adding a `doi` links it.

Four entries in `publications.yaml` carry a `VERIFY` comment where the
publisher's record disagrees with the CV the content came from — the venue on
the ASE paper, the published title on the Cluster Computing paper, the author
list on the JSS paper, and the year and pages on the CCIS chapter. The CV's
wording was kept in each case; the DOIs resolve regardless.

`PROFILE-README.md` in this repo is the rewritten GitHub profile README; it
belongs in the `showkat2203/showkat2203` repository, not this one.

import { defineCollection, z } from 'astro:content';
import { file, glob } from 'astro/loaders';

/** A profile link. The URL is required: a link with nowhere to go is a bug,
 *  not a state to render, so a missing one fails the build. */
const link = z.object({ label: z.string(), url: z.string().url() });

const profile = defineCollection({
  loader: file('src/content/profile.yaml'),
  schema: z.object({
    name: z.string(),
    selfAliases: z.array(z.string()).min(1),
    role: z.string(),
    location: z.string(),
    locationShort: z.string(),
    residency: z.string(),
    email: z.string().email(),
    headline: z.string(),
    positioning: z.string(),
    metaDescription: z.string(),
    cv: z.object({
      hosted: z.string(),
      drive: z.string().url().nullable(),
      latex: z.string().url().nullable(),
    }),
    links: z.object({ github: link, scholar: link, linkedin: link }),
  }),
});

/**
 * Scholar's own figures. Everything else about the research record is computed
 * from the publications collection — see src/lib/record.ts.
 */
const scholar = defineCollection({
  loader: file('src/content/scholar.yaml'),
  schema: z.object({
    /** `YYYY-MM` these figures were read off the Scholar profile. */
    asOf: z.string().regex(/^\d{4}-\d{2}$/),
    totalCitations: z.number().int().nonnegative(),
    hIndex: z.number().int().nonnegative(),
    /** Citation count per publications.yaml key. Complete means computed. */
    perPublication: z.record(z.string(), z.number().int().nonnegative()).default({}),
  }),
});

const domains = defineCollection({
  loader: file('src/content/domains.yaml'),
  schema: z.object({
    order: z.number(),
    label: z.string(),
    body: z.string(),
  }),
});

const work = defineCollection({
  loader: file('src/content/work.yaml'),
  schema: z.object({
    order: z.number(),
    title: z.string(),
    org: z.string(),
    period: z.string(),
    diagram: z.enum(['timing', 'reconcile', 'graph', 'pipeline']),
    tags: z.array(z.string()),
    body: z.string(),
    metrics: z.array(z.object({ value: z.string(), label: z.string() })),
  }),
});

const experience = defineCollection({
  loader: file('src/content/experience.yaml'),
  schema: z.object({
    order: z.number(),
    role: z.string(),
    org: z.string(),
    location: z.string(),
    start: z.string().regex(/^\d{4}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
    period: z.string(),
    current: z.boolean(),
    concurrentWith: z.string().nullable().default(null),
    /** Key from institutions.yaml, for the timeline's monogram. */
    institution: z.string(),
    /** One line on the system itself, so bullets can be about the work. */
    context: z.string().nullable().default(null),
    summary: z.string().nullable(),
    /** Detailed bullets, used on /cv only. */
    bullets: z.array(z.string()).default([]),
  }),
});

const publications = defineCollection({
  loader: file('src/content/publications.yaml'),
  schema: z.object({
    headlineOrder: z.number().min(1).max(5).nullable(),
    type: z.enum(['conference', 'journal']),
    year: z.number(),
    title: z.string(),
    authors: z.array(z.string()).min(1),
    venue: z.string(),
    venueShort: z.string(),
    details: z.string().nullable(),
    doi: z.string().nullable(),
    url: z.string().url().nullable(),
  }),
});

const cv = defineCollection({
  loader: file('src/content/cv.yaml'),
  schema: z.object({
    order: z.number(),
    heading: z.string(),
    items: z.array(z.string()).optional(),
    entries: z
      .array(
        z.object({
          institution: z.string(),
          /** Key from institutions.yaml, for the logo. */
          institutionKey: z.string().nullable().default(null),
          qualification: z.string(),
          location: z.string(),
          period: z.string(),
          notes: z.array(z.string()),
        }),
      )
      .optional(),
  }),
});

const skills = defineCollection({
  loader: file('src/content/skills.yaml'),
  schema: z.object({
    order: z.number(),
    heading: z.string(),
    items: z.string(),
  }),
});

const institutions = defineCollection({
  loader: file('src/content/institutions.yaml'),
  schema: z.object({
    order: z.number(),
    name: z.string(),
    short: z.string(),
    monogram: z.string().min(1).max(4),
    /** Shown in the credibility row under the hero. */
    featured: z.boolean(),
    /** Where the logo SVG came from. Used by `npm run logos:fetch`, and as a
     *  live fallback when no file has been downloaded yet. */
    logoSource: z.string().url().nullable().default(null),
    /** Optional nudge for a remote logo's size, which cannot be measured at
     *  build time the way a local file's viewBox can. 1 leaves it alone. */
    logoScale: z.number().min(0.4).max(1.6).default(1),
  }),
});

const news = defineCollection({
  loader: file('src/content/news.yaml'),
  schema: z.object({
    date: z.coerce.date(),
    text: z.string(),
    href: z.string().nullable().default(null),
    linkLabel: z.string().nullable().default(null),
  }),
});

const blog = defineCollection({
  loader: glob({ base: 'src/content/blog', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    /** Omit or set false to publish. Drafts are excluded from the build. */
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    /** Key from series.yaml. Null leaves the post standing alone. */
    series: z.string().nullable().default(null),
    /** Position within the series. Posts without one sort last, by date. */
    seriesOrder: z.number().int().positive().nullable().default(null),
  }),
});

/** Groups of posts meant to be read in order. See src/content/series.yaml. */
const series = defineCollection({
  loader: file('src/content/series.yaml'),
  schema: z.object({
    order: z.number(),
    title: z.string(),
    description: z.string(),
  }),
});

/**
 * The interview-prep offer. `booking.url` null is a working state, not a
 * placeholder: the page falls back to the email address and loads no
 * third-party script.
 */
const prep = defineCollection({
  loader: file('src/content/prep.yaml'),
  schema: z.object({
    kicker: z.string(),
    headline: z.string(),
    lede: z.string(),
    metaDescription: z.string(),
    sessionMinutes: z.number().int().positive(),
    fitHeading: z.string(),
    fitFor: z.array(z.string()).min(1),
    fitNot: z.array(z.string()).min(1),
    formatsHeading: z.string(),
    formatsNote: z.string(),
    formats: z
      .array(z.object({ order: z.number(), title: z.string(), body: z.string() }))
      .min(1),
    processHeading: z.string(),
    process: z
      .array(z.object({ order: z.number(), title: z.string(), body: z.string() }))
      .min(1),
    credibilityHeading: z.string(),
    credibility: z.string(),
    credibilityLink: z.string(),
    bookingHeading: z.string(),
    booking: z.object({
      /** Cal.com booking link. Null falls back to the email call to action. */
      url: z.string().url().nullable(),
      note: z.string(),
    }),
  }),
});

export const collections = {
  profile,
  scholar,
  prep,
  series,
  domains,
  work,
  experience,
  publications,
  cv,
  skills,
  institutions,
  news,
  blog,
};

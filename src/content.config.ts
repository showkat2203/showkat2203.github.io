import { defineCollection, z } from 'astro:content';
import { file, glob } from 'astro/loaders';

const link = z.object({ label: z.string(), url: z.string().url().nullable() });

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
    record: z.object({
      publications: z.number(),
      citations: z.number(),
      hIndex: z.number(),
      venues: z.array(z.string()),
    }),
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
  }),
});

export const collections = {
  profile,
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

import { defineCollection, z } from 'astro:content';
import { file } from 'astro/loaders';

const link = z.object({ label: z.string(), url: z.string().url().nullable() });

const profile = defineCollection({
  loader: file('src/content/profile.yaml'),
  schema: z.object({
    name: z.string(),
    selfAliases: z.array(z.string()).min(1),
    location: z.string(),
    residency: z.string(),
    email: z.string().email(),
    heroSentence: z.string(),
    metaDescription: z.string(),
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
    exponent: z.number(),
    unit: z.string(),
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
    magnitude: z.object({ exponent: z.number(), unit: z.string() }),
    body: z.string(),
    metrics: z.array(z.object({ value: z.string(), label: z.string() })),
    detail: z.string().nullable(),
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
    exponent: z.number().nullable(),
    items: z.string(),
  }),
});

export const collections = { profile, domains, work, experience, publications, cv, skills };

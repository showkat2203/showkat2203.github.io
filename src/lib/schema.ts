/**
 * JSON-LD, assembled from the same collections the pages render.
 *
 * Search engines read this to decide what a page is *about*, which for a named
 * person is the difference between a blue link and a knowledge panel. Building
 * it from the content rather than writing it by hand means it cannot claim
 * something the visible page does not: add a paper and it appears in both.
 *
 * Every node carries a stable `@id`, so the Person is described once and the
 * per-page nodes reference it instead of repeating it.
 */

export type JsonLd = Record<string, unknown>;

type Profile = {
  name: string;
  role: string;
  location: string;
  email: string;
  positioning: string;
  metaDescription: string;
  links: { github: { url: string }; scholar: { url: string }; linkedin: { url: string } };
};

type PublicationEntry = {
  id: string;
  data: {
    title: string;
    authors: string[];
    year: number;
    venue: string;
    type: 'journal' | 'conference';
    doi: string | null;
    url: string | null;
  };
};

type PostEntry = {
  id: string;
  data: { title: string; description: string; date: Date; tags: string[] };
};

export type SiteContext = {
  site: URL;
  profile: Profile;
  /** Site-level description, with the research tokens already substituted. */
  siteDescription: string;
  /** Organisation of the current role. */
  worksFor: string | null;
  /** Degree-granting institutions, most recent first. */
  alumniOf: string[];
  /** Practice areas, used verbatim as subject-matter claims. */
  knowsAbout: string[];
};

const abs = (site: URL, path: string) => new URL(path, site).href;

/** `#person` and `#website` are referenced from every page's own node. */
export const personId = (site: URL) => `${abs(site, '/')}#person`;
export const siteId = (site: URL) => `${abs(site, '/')}#website`;
export const blogId = (site: URL) => `${abs(site, '/blog/')}#blog`;

/** Split a city-state-country string into the parts schema.org asks for. */
function address(location: string): JsonLd | undefined {
  const parts = location.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return undefined;
  const [locality, region, country] = parts;
  return {
    '@type': 'PostalAddress',
    addressLocality: locality,
    ...(region ? { addressRegion: region } : {}),
    ...(country ? { addressCountry: country } : {}),
  };
}

export function personNode(ctx: SiteContext): JsonLd {
  const { site, profile } = ctx;
  return {
    '@type': 'Person',
    '@id': personId(site),
    name: profile.name,
    url: abs(site, '/'),
    image: abs(site, '/img/portrait-800.jpg'),
    email: `mailto:${profile.email}`,
    jobTitle: profile.role,
    description: profile.positioning,
    address: address(profile.location),
    // The accounts that are unambiguously the same person. Search engines use
    // these to reconcile this page with the profiles they already know.
    sameAs: [profile.links.linkedin.url, profile.links.github.url, profile.links.scholar.url],
    ...(ctx.worksFor ? { worksFor: { '@type': 'Organization', name: ctx.worksFor } } : {}),
    ...(ctx.alumniOf.length
      ? { alumniOf: ctx.alumniOf.map((name) => ({ '@type': 'CollegeOrUniversity', name })) }
      : {}),
    ...(ctx.knowsAbout.length ? { knowsAbout: ctx.knowsAbout } : {}),
  };
}

export function websiteNode(ctx: SiteContext): JsonLd {
  const { site, profile } = ctx;
  return {
    '@type': 'WebSite',
    '@id': siteId(site),
    url: abs(site, '/'),
    name: profile.name,
    description: ctx.siteDescription,
    inLanguage: 'en-US',
    publisher: { '@id': personId(site) },
  };
}

/**
 * Trail from the home page down to `canonical`. `trail` names the steps after
 * Home; a post passes its section and its own title. Omitted on the home page,
 * which is the root of the trail and not a step in it.
 */
export function breadcrumbs(
  site: URL,
  canonical: URL,
  trail: Array<{ name: string; path: string }>,
): JsonLd | null {
  if (canonical.pathname === '/' || trail.length === 0) return null;
  const steps = [{ name: 'Home', path: '/' }, ...trail];
  return {
    '@type': 'BreadcrumbList',
    '@id': `${canonical.href}#breadcrumbs`,
    itemListElement: steps.map((step, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: step.name,
      item: abs(site, step.path),
    })),
  };
}

/**
 * One publication. A conference paper's proceedings is a CreativeWork rather
 * than a Periodical, which is what `isPartOf` actually expects for it — a
 * journal issue is the only one of the two that is genuinely periodical.
 */
export function publicationNode(site: URL, pub: PublicationEntry): JsonLd {
  const { data } = pub;
  const href = data.doi ? `https://doi.org/${data.doi}` : data.url;
  return {
    '@type': 'ScholarlyArticle',
    '@id': `${abs(site, '/publications/')}#${pub.id}`,
    name: data.title,
    headline: data.title,
    author: data.authors.map((name) => ({ '@type': 'Person', name })),
    // Only the year is known for every paper, and a year alone is valid 8601.
    datePublished: String(data.year),
    isPartOf: {
      '@type': data.type === 'journal' ? 'Periodical' : 'CreativeWork',
      name: data.venue,
    },
    inLanguage: 'en',
    ...(data.doi
      ? { identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: data.doi } }
      : {}),
    ...(href ? { url: href, sameAs: href } : {}),
  };
}

export function blogPostingNode(
  ctx: SiteContext,
  post: PostEntry,
  opts: { canonical: URL; image: URL; wordCount: number; modified?: Date },
): JsonLd {
  const { site } = ctx;
  return {
    '@type': 'BlogPosting',
    '@id': `${opts.canonical.href}#post`,
    headline: post.data.title,
    description: post.data.description,
    datePublished: post.data.date.toISOString(),
    dateModified: (opts.modified ?? post.data.date).toISOString(),
    author: { '@id': personId(site) },
    publisher: { '@id': personId(site) },
    mainEntityOfPage: opts.canonical.href,
    url: opts.canonical.href,
    image: opts.image.href,
    inLanguage: 'en-US',
    wordCount: opts.wordCount,
    isPartOf: { '@id': blogId(site) },
    ...(post.data.tags.length ? { keywords: post.data.tags } : {}),
  };
}

export type PageType = 'ProfilePage' | 'CollectionPage' | 'WebPage' | 'Blog';

/**
 * The page-level node, tying this URL to the site and naming its subject.
 *
 * `mainEntity` is what the page is chiefly *of* — the person on the profile and
 * CV, the list on the publications page, the post on a post page. `about` is
 * only set where the page really is about the person, which a post they wrote
 * is not.
 */
export function pageNode(
  ctx: SiteContext,
  opts: {
    canonical: URL;
    type: PageType;
    title: string;
    description: string;
    image: URL;
    /** `@id` of this page's principal subject. */
    mainEntity?: string;
    /** Set when the page's subject matter is the person themselves. */
    aboutPerson?: boolean;
  },
): JsonLd {
  const { site } = ctx;
  return {
    '@type': opts.type,
    '@id': `${opts.canonical.href}#page`,
    url: opts.canonical.href,
    name: opts.title,
    description: opts.description,
    isPartOf: { '@id': siteId(site) },
    primaryImageOfPage: opts.image.href,
    inLanguage: 'en-US',
    ...(opts.mainEntity ? { mainEntity: { '@id': opts.mainEntity } } : {}),
    ...(opts.aboutPerson ? { about: { '@id': personId(site) } } : {}),
  };
}

/** The publications page's list, in the order the page renders them. */
export function publicationListNode(site: URL, pubs: PublicationEntry[]): JsonLd {
  return {
    '@type': 'ItemList',
    '@id': `${abs(site, '/publications/')}#list`,
    name: 'Peer-reviewed publications',
    numberOfItems: pubs.length,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    itemListElement: pubs.map((pub, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: { '@id': `${abs(site, '/publications/')}#${pub.id}` },
    })),
  };
}

/**
 * The blog itself, referenced by each post's `isPartOf`.
 *
 * `posts` are described inline rather than referenced by bare `@id`, so the
 * graph on this page stands on its own: a consumer that does not follow
 * cross-document ids still learns what the blog contains.
 */
export function blogNode(ctx: SiteContext, posts: PostEntry[]): JsonLd {
  const { site } = ctx;
  return {
    '@type': 'Blog',
    '@id': blogId(site),
    url: abs(site, '/blog/'),
    name: `${ctx.profile.name} — writing`,
    inLanguage: 'en-US',
    author: { '@id': personId(site) },
    publisher: { '@id': personId(site) },
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      '@id': `${abs(site, `/blog/${post.id}/`)}#post`,
      headline: post.data.title,
      description: post.data.description,
      datePublished: post.data.date.toISOString(),
      url: abs(site, `/blog/${post.id}/`),
      author: { '@id': personId(site) },
      ...(post.data.tags.length ? { keywords: post.data.tags } : {}),
    })),
  };
}

/**
 * The interview-prep offer.
 *
 * Typed as a `Service` with a zero-price `Offer`, which is the accurate shape
 * while sessions are free: search engines read a price of 0 as free rather than
 * as missing. `provider` points at the Person, so the offer inherits the
 * credibility that node already carries.
 */
export function serviceNode(
  ctx: SiteContext,
  prep: {
    headline: string;
    lede: string;
    sessionMinutes: number;
    formats: Array<{ title: string; body: string }>;
  },
): JsonLd {
  const { site } = ctx;
  const url = abs(site, '/interview-prep/');
  return {
    '@type': 'Service',
    '@id': `${url}#service`,
    name: prep.headline,
    description: prep.lede,
    url,
    serviceType: 'Technical interview preparation',
    provider: { '@id': personId(site) },
    audience: { '@type': 'Audience', audienceType: 'Software engineers' },
    // Remote sessions, so the reach is not a place.
    availableChannel: {
      '@type': 'ServiceChannel',
      serviceUrl: url,
      availableLanguage: { '@type': 'Language', name: 'English' },
    },
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      description: `${prep.sessionMinutes}-minute one-to-one session`,
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Session formats',
      itemListElement: prep.formats.map((format) => ({
        '@type': 'Offer',
        price: 0,
        priceCurrency: 'USD',
        itemOffered: { '@type': 'Service', name: format.title, description: format.body },
      })),
    },
  };
}

/** A series of posts, for its own index page. */
export function seriesNode(
  ctx: SiteContext,
  series: { id: string; title: string; description: string },
  posts: PostEntry[],
): JsonLd {
  const { site } = ctx;
  const url = abs(site, `/blog/series/${series.id}/`);
  return {
    '@type': 'CreativeWorkSeries',
    '@id': `${url}#series`,
    name: series.title,
    description: series.description,
    url,
    author: { '@id': personId(site) },
    inLanguage: 'en-US',
    hasPart: posts.map((post) => ({
      '@type': 'BlogPosting',
      '@id': `${abs(site, `/blog/${post.id}/`)}#post`,
      headline: post.data.title,
      url: abs(site, `/blog/${post.id}/`),
      datePublished: post.data.date.toISOString(),
      author: { '@id': personId(site) },
    })),
  };
}

/** Minimal Blog node for a post page, so its `isPartOf` resolves locally. */
export function blogStubNode(ctx: SiteContext): JsonLd {
  const { site } = ctx;
  return {
    '@type': 'Blog',
    '@id': blogId(site),
    url: abs(site, '/blog/'),
    name: `${ctx.profile.name} — writing`,
    inLanguage: 'en-US',
    author: { '@id': personId(site) },
  };
}

/**
 * Wrap the nodes as a single graph and serialise it for embedding.
 *
 * `<` is escaped because a literal `</script>` anywhere in the content would
 * otherwise end the script element early and spill the rest onto the page.
 */
export function serialiseGraph(nodes: Array<JsonLd | null | undefined>): string {
  const graph = nodes.filter((node): node is JsonLd => Boolean(node));
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(
    /</g,
    '\\u003c',
  );
}

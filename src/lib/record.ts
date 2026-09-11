/**
 * The research record, assembled from data rather than typed out by hand.
 *
 * The paper count and venue list are computed from the publications collection,
 * so they cannot drift from it. Citations and the h-index come from Scholar,
 * which has no API: they are read from scholar.yaml and carry the date they
 * were read. When that file lists a citation count for every publication, both
 * figures are computed from those counts instead of taken on trust.
 */

export type PublicationLike = {
  id: string;
  data: { venue: string; venueShort: string; year: number };
};

export type ScholarData = {
  asOf: string;
  totalCitations: number;
  hIndex: number;
  perPublication: Record<string, number>;
};

export type ResearchRecord = {
  /** Number of publications in the collection. */
  publications: number;
  citations: number;
  hIndex: number;
  /** Venue names, most-published first, then alphabetically. */
  venues: string[];
  /** `YYYY-MM` the Scholar figures were read. */
  asOf: string;
  /** True when citations and h-index were computed from per-paper counts. */
  computed: boolean;
};

/** h-index: the largest h such that h papers have at least h citations each. */
export function hIndexOf(counts: number[]): number {
  const sorted = [...counts].sort((a, b) => b - a);
  let h = 0;
  while (h < sorted.length && sorted[h] >= h + 1) h += 1;
  return h;
}

/**
 * Venue short names, most recently published in first, then by how many papers
 * appeared there, then by name. Recency first because it puts current work at
 * the front of a list that is read as a summary; the short name because the two
 * ECSA papers are one venue, not two, and a proceedings title runs long.
 */
export function venuesOf(pubs: PublicationLike[]): string[] {
  const seen = new Map<string, { latest: number; count: number }>();
  for (const { data } of pubs) {
    const at = seen.get(data.venueShort);
    if (at) {
      at.latest = Math.max(at.latest, data.year);
      at.count += 1;
    } else {
      seen.set(data.venueShort, { latest: data.year, count: 1 });
    }
  }
  return [...seen.entries()]
    .sort(([aName, a], [bName, b]) => b.latest - a.latest || b.count - a.count || aName.localeCompare(bName))
    .map(([name]) => name);
}

/** Format a `YYYY-MM` stamp as e.g. `September 2026`. */
export function formatAsOf(asOf: string, month: 'long' | 'short' = 'long'): string {
  const [year, m] = asOf.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString('en-US', {
    month,
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function buildRecord(pubs: PublicationLike[], scholar: ScholarData): ResearchRecord {
  const perPub = pubs.map((pub) => scholar.perPublication[pub.id]);
  const complete = pubs.length > 0 && perPub.every((n) => typeof n === 'number');
  const counts = complete ? (perPub as number[]) : [];

  return {
    publications: pubs.length,
    citations: complete ? counts.reduce((sum, n) => sum + n, 0) : scholar.totalCitations,
    hIndex: complete ? hIndexOf(counts) : scholar.hIndex,
    venues: venuesOf(pubs),
    asOf: scholar.asOf,
    computed: complete,
  };
}

/**
 * Substitute `{publications}`, `{citations}` and `{hIndex}` in prose kept in
 * YAML, so a figure written in a sentence cannot drift from the same figure
 * shown in a stat block.
 */
export function fillTokens(text: string, record: ResearchRecord): string {
  return text.replace(/\{(publications|citations|hIndex)\}/g, (whole, key) => {
    const value = record[key as 'publications' | 'citations' | 'hIndex'];
    return typeof value === 'number' ? String(value) : whole;
  });
}

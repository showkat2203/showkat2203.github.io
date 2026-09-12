/**
 * The research record, assembled from the publications collection.
 *
 * Citation counts used to live here too, fetched or hand-entered. They are
 * gone: every figure on this site is now derived from content in the repo, so
 * nothing can be stale, mis-sourced, or disagree with the page it sits on.
 */

export type PublicationLike = {
  id: string;
  data: { venue: string; venueShort: string; year: number };
};

export type ResearchRecord = {
  /** Number of publications in the collection. */
  publications: number;
  /** Venue names, most recently published in first. */
  venues: string[];
};

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

export function buildRecord(pubs: PublicationLike[]): ResearchRecord {
  return { publications: pubs.length, venues: venuesOf(pubs) };
}

/**
 * Everyone who has appeared on a paper alongside the site's owner, most
 * frequent first. Derived from the author lists already in publications.yaml,
 * so it cannot name a collaborator the publication list does not.
 */
export function coAuthorsOf(
  pubs: Array<{ data: { authors: string[] } }>,
  selfAliases: string[],
): Array<{ name: string; papers: number }> {
  const self = new Set(selfAliases);
  const tally = new Map<string, number>();
  for (const { data } of pubs) {
    // A name repeated within one author list still counts once for that paper.
    for (const name of new Set(data.authors)) {
      if (self.has(name)) continue;
      tally.set(name, (tally.get(name) ?? 0) + 1);
    }
  }
  return [...tally.entries()]
    .map(([name, papers]) => ({ name, papers }))
    .sort((a, b) => b.papers - a.papers || a.name.localeCompare(b.name));
}

/**
 * Substitute `{publications}` in prose kept in YAML, so a figure written in a
 * sentence cannot drift from the same figure shown elsewhere on the page.
 */
export function fillTokens(text: string, record: ResearchRecord): string {
  return text.replace(/\{publications\}/g, String(record.publications));
}

/**
 * Refreshes the citation figures in src/content/scholar.yaml from OpenAlex.
 *
 *   npm run scholar            # fetch and write
 *   npm run scholar -- --dry   # fetch and report, write nothing
 *
 * Why not Google Scholar: it has no API, has never had one, and blocks
 * automated access. OpenAlex is an open REST API built for this, so the numbers
 * are fetched from a source that wants to be fetched from — and the page says
 * OpenAlex rather than claiming a Scholar figure it did not get from Scholar.
 *
 * The site never calls this at page load. It runs weekly in CI, writes the YAML
 * and commits only if something changed, so a failed fetch leaves last week's
 * numbers standing instead of breaking a page.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { domain } from '../astro.config.mjs';

const API = 'https://api.openalex.org';
const SCHOLAR = 'src/content/scholar.yaml';
const dry = process.argv.includes('--dry');

// OpenAlex asks callers to identify themselves. The site's own domain does
// that without putting a personal address into a third party's logs.
const headers = { 'user-agent': `${domain} (+https://${domain}; research-record sync)` };

async function get(path) {
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) throw new Error(`OpenAlex ${res.status} ${res.statusText} for ${path}`);
  return res.json();
}

/** Loose match: same surname, and every initial of the shorter name agrees. */
function isSamePerson(candidate, names) {
  const norm = (s) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ.]/g, '')
      .split(/[\s,]+/)
      .filter(Boolean);
  const cand = norm(candidate);
  if (!cand.length) return false;
  return names.some((name) => {
    const want = norm(name);
    if (!want.length) return false;
    if (cand.at(-1) !== want.at(-1)) return false; // surnames must agree
    const [short, long] = cand.length <= want.length ? [cand, want] : [want, cand];
    // Every leading part of the shorter form must be a prefix of the longer's.
    return short.slice(0, -1).every((part, i) => long[i]?.startsWith(part) || part.startsWith(long[i] ?? ''));
  });
}

/** Find the OpenAlex author id from the DOIs already in publications.yaml. */
async function resolveAuthor(names) {
  const pubs = parse(await readFile('src/content/publications.yaml', 'utf8'));
  const dois = Object.values(pubs)
    .map((pub) => pub.doi)
    .filter(Boolean);
  if (!dois.length) throw new Error('no DOIs in publications.yaml to resolve an author from');

  const tally = new Map();
  let reached = 0;
  let lastError = null;
  for (const doi of dois) {
    let work;
    try {
      work = await get(`/works/doi:${encodeURIComponent(doi)}`);
      reached += 1;
    } catch (err) {
      // A paper OpenAlex has not indexed tells us nothing either way. A paper
      // it could not be asked about is a different problem, tracked below.
      lastError = err;
      continue;
    }
    for (const { author } of work.authorships ?? []) {
      if (!author?.id || !isSamePerson(author.display_name ?? '', names)) continue;
      const seen = tally.get(author.id) ?? { id: author.id, name: author.display_name, hits: 0 };
      seen.hits += 1;
      tally.set(author.id, seen);
    }
  }

  // Distinguish "the name did not match" from "nothing answered". Reporting a
  // dead network as a matching failure sends the reader after the wrong bug.
  if (!reached) {
    throw new Error(
      `could not reach OpenAlex for any of the ${dois.length} DOIs — last error: ${lastError}`,
    );
  }

  const ranked = [...tally.values()].sort((a, b) => b.hits - a.hits);
  if (!ranked.length) {
    throw new Error(
      `no OpenAlex author matched ${names.join(' / ')} on any of the ${reached} indexed papers`,
    );
  }
  for (const who of ranked) console.log(`  candidate ${who.id}  ${who.name}  (${who.hits} papers)`);
  return ranked[0];
}

const raw = await readFile(SCHOLAR, 'utf8');
const current = parse(raw).main;
const profile = parse(await readFile('src/content/profile.yaml', 'utf8')).main;
const names = [profile.name, ...(profile.selfAliases ?? [])];

let id = current.source?.id ?? null;
if (!id) {
  console.log('No author id pinned; resolving from the DOIs in publications.yaml');
  const found = await resolveAuthor(names);
  id = found.id;
  console.log(`Resolved ${found.name} -> ${id}`);
}

const shortId = String(id).replace(/^https?:\/\/openalex\.org\//, '');
const author = await get(`/authors/${shortId}`);

/**
 * OpenAlex disambiguates authors automatically and sometimes splits one person
 * across several records. A split profile undercounts silently: the record we
 * pinned looks healthy, it is just missing half the papers. So report what the
 * aggregate is actually made of, and name any sibling record that looks like
 * the same person, rather than trusting a single number.
 */
async function audit() {
  const works = [];
  let cursor = '*';
  while (cursor) {
    const page = await get(
      `/works?filter=author.id:${shortId}&per-page=200&cursor=${encodeURIComponent(cursor)}` +
        `&select=id,doi,title,publication_year,cited_by_count`,
    );
    works.push(...page.results);
    cursor = page.results.length ? page.meta?.next_cursor : null;
  }
  const summed = works.reduce((total, work) => total + (work.cited_by_count ?? 0), 0);
  console.log(`\n  ${works.length} works on this record, summing to ${summed} citations`);
  for (const work of [...works].sort((a, b) => b.cited_by_count - a.cited_by_count)) {
    console.log(
      `    ${String(work.cited_by_count).padStart(4)}  ${work.publication_year}  ` +
        `${(work.title ?? '').slice(0, 68)}`,
    );
  }

  // Anyone else on OpenAlex answering to the same name.
  const name = author.display_name ?? '';
  const others = await get(
    `/authors?search=${encodeURIComponent(name)}&per-page=25` +
      `&select=id,display_name,works_count,cited_by_count`,
  );
  const siblings = (others.results ?? []).filter(
    (other) => !String(other.id).endsWith(shortId) && isSamePerson(other.display_name ?? '', names),
  );
  if (siblings.length) {
    console.log(`\n  OTHER OpenAlex records matching this name — the profile may be split:`);
    let extra = 0;
    for (const other of siblings) {
      extra += other.cited_by_count ?? 0;
      console.log(
        `    ${other.id}  ${other.display_name}  ` +
          `${other.works_count} works, ${other.cited_by_count} citations`,
      );
    }
    console.log(`    combined with the pinned record: ${(author.cited_by_count ?? 0) + extra}`);
  } else {
    console.log('\n  No other OpenAlex record matches this name; the profile is not split.');
  }
}

try {
  await audit();
} catch (err) {
  console.log(`\n  (audit skipped: ${err})`);
}

const next = {
  citations: author.cited_by_count ?? 0,
  hIndex: author.summary_stats?.h_index ?? 0,
  works: author.works_count ?? 0,
  name: author.display_name,
  url: `https://openalex.org/${shortId}`,
};

console.log(`\n${next.name}`);
console.log(`  citations  ${current.totalCitations} -> ${next.citations}`);
console.log(`  h-index    ${current.hIndex} -> ${next.hIndex}`);
console.log(`  works      ${next.works} indexed by OpenAlex`);

if (!Number.isFinite(next.citations) || !Number.isFinite(next.hIndex)) {
  throw new Error('OpenAlex returned no usable figures; leaving the file alone');
}

const changed = next.citations !== current.totalCitations || next.hIndex !== current.hIndex;
const asOf = new Date().toISOString().slice(0, 10);

if (dry) {
  console.log(`\n--dry: ${changed ? 'would update' : 'no change'}`);
  process.exit(0);
}

// Rewritten field by field rather than re-serialised, so the file keeps its
// comments — they are the instructions for anyone editing it by hand.
let out = raw
  // Quoted, because a bare 2026-09-12 is a YAML *date*, not a string — which
  // is why 2026-09 worked and the first synced value broke the build.
  .replace(/^(\s*asOf:).*$/m, `$1 '${asOf}'`)
  .replace(/^(\s*totalCitations:).*$/m, `$1 ${next.citations}`)
  .replace(/^(\s*hIndex:).*$/m, `$1 ${next.hIndex}`)
  .replace(/^(\s*id:).*$/m, `$1 ${shortId}`)
  .replace(/^(\s*url:).*$/m, `$1 ${next.url}`);

if (out === raw && changed) throw new Error('nothing was substituted; scholar.yaml shape has drifted');
await writeFile(SCHOLAR, out);
console.log(`\nwrote ${SCHOLAR} (asOf ${asOf})${changed ? '' : ' — figures unchanged'}`);

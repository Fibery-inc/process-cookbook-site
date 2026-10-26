// The one index the REST routes and the MCP server share, built once per server instance.
import searchDocs from '../../public/search-index.json';
import { recipes, byId, meta, humanMarkdown, modelMarkdown, domainLabel, type Recipe } from './recipes';
import { makeIndex, searchDetailed, type SearchDoc, type Hit } from './search';
import { scoreByMeaning, fitsByMeaning, FLOOR } from './semantic';

const index = makeIndex(searchDocs as SearchDoc[]);
const REQUEST_URL = 'https://github.com/Fibery-inc/process-cookbook/issues/new?labels=recipe%20request';

export type FindOpts = { domain?: string; for?: string; limit?: number; debug?: boolean };

export async function findRecipes(query: string | undefined, opts: FindOpts = {}) {
  const q = (query || '').trim();
  const filter = { ...(opts.domain ? { domain: opts.domain } : {}), ...(opts.for ? { for: opts.for } : {}) };
  if (!q) return browse(filter, opts);
  const limit = Math.min(opts.limit || 5, 20);
  const words = searchDetailed(index, q, { ...opts, limit: 20 });
  const meaning = await scoreByMeaning(q);
  const inFilter = (id: string) => {
    const r = byId(id);
    return !!r && (!filter.domain || r.domain === filter.domain) && (!filter.for || r.for === filter.for);
  };
  const scored = meaning?.filter((s) => inFilter(s.id));
  const fitsMeaning = !!scored && fitsByMeaning(scored);
  const fits = words.fits || fitsMeaning;
  const hits = scored ? blend(words.hits, scored, words.fits).slice(0, limit) : words.hits.slice(0, limit);
  const wordsMatch = words.mode === 'and' ? 'all words' : words.mode === 'or' ? `some words (${Math.round(words.coverage * 100)}% of the query)` : 'none';
  return {
    query: q,
    mode: 'search' as const,
    ...filter,
    count: hits.length,
    fits,
    match: words.fits ? wordsMatch : fitsMeaning ? 'meaning' : hits.length ? (scored ? 'nothing close' : wordsMatch) : 'none',
    hits: hits.map(withUrls),
    note: !fits
      ? `No recipe fits well${hits.length ? '; the hits below are the nearest, not a match' : ''}. Browse with list_domains or an empty query, design from the process directly, or request a recipe at ${REQUEST_URL}`
      : undefined,
    ...(opts.debug ? { words: words.words, meaning: scored ? scored.slice(0, 5).map((s) => `${s.id} ${s.similarity.toFixed(2)}`) : 'off' } : {}),
  };
}

// Reciprocal rank fusion, meaning weighted twice: in calibration it ranked the right recipe first for every query.
// A recipe found by words but far in meaning is noise (fuzzy spelling, a shared common word); only the best word hit
// stays when the words fit, so a rare term the embedding misses ("eartip") still finds its recipe.
const RRF_K = 10;
function blend(wordHits: Hit[], scored: { id: string; similarity: number }[], wordsFit: boolean): (Hit & { similarity: number })[] {
  const similarity = new Map(scored.map((s) => [s.id, s.similarity]));
  const score = new Map<string, number>();
  scored.filter((s) => s.similarity >= FLOOR).forEach((s, i) => score.set(s.id, 2 / (RRF_K + i + 1)));
  wordHits.forEach((h, i) => {
    if ((similarity.get(h.id) ?? 0) < FLOOR && !(wordsFit && i === 0)) return;
    score.set(h.id, (score.get(h.id) || 0) + 1 / (RRF_K + i + 1));
  });
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => ({ ...(wordHits.find((h) => h.id === id) || summaryOf(byId(id)!)), similarity: Math.round((similarity.get(id) ?? 0) * 100) / 100 }));
}

// No query: the recipes themselves, in domain and title order, so a model can read the shelf instead of guessing a search.
function browse(filter: { domain?: string; for?: string }, opts: FindOpts) {
  const all = recipes
    .filter((r) => (!filter.domain || r.domain === filter.domain) && (!filter.for || r.for === filter.for))
    .sort((a, b) => a.domain.localeCompare(b.domain) || a.title.localeCompare(b.title));
  const limit = Math.min(opts.limit || 50, 50);
  return {
    query: '',
    mode: 'browse' as const,
    ...filter,
    count: Math.min(all.length, limit),
    total: all.length,
    hits: all.slice(0, limit).map((r) => withUrls(summaryOf(r))),
    note: all.length === 0 ? `No recipes${filter.domain ? ` in domain "${filter.domain}"` : ''}${filter.for ? ` for "${filter.for}"` : ''}. list_domains has the domains that exist.` : undefined,
  };
}

const summaryOf = (r: Recipe): Hit => ({ id: r.id, title: r.title, summary: r.summary, domain: r.domain, for: r.for, version: r.version, updated: r.updated });
const withUrls = (h: Hit) => ({ ...h, url: pageUrl(h.id), markdown: `${pageUrl(h.id)}.md` });

export const PARTS = ['human', 'model', 'all'] as const;
export type Part = (typeof PARTS)[number];

export function getRecipe(id: string, part: Part = 'all') {
  const r = byId(id);
  if (!r) return null;
  const markdown = part === 'human' ? `# ${r.title}\n\n${r.promise}\n\n${humanMarkdown(r)}` : part === 'model' ? `# ${r.title}\n\n${modelMarkdown(r)}` : withoutFrontmatter(r.markdown);
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    domain: r.domain,
    for: r.for,
    keywords: r.keywords,
    version: r.version,
    updated: r.updated,
    license: r.license,
    url: pageUrl(r.id),
    file: `${pageUrl(r.id)}.md`,
    source: r.github,
    part,
    markdown,
  };
}

// The metadata travels in the fields above; the Markdown starts at the title.
function withoutFrontmatter(md: string) {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, '');
}

export function listDomains() {
  return Object.entries(meta.domains)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, count]) => ({
      domain,
      label: domainLabel(domain),
      count,
      url: `${site()}/d/${domain}`,
      recipes: recipes
        .filter((r) => r.domain === domain)
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((r) => ({ id: r.id, title: r.title, summary: r.summary })),
    }));
}

export function site() {
  return (import.meta.env.SITE || 'https://processcookbook.org').replace(/\/$/, '');
}

export function pageUrl(id: string) {
  return `${site()}/r/${id}`;
}

export const catalogMeta = { commit: meta.commit, count: recipes.length, fetchedAt: meta.fetchedAt };

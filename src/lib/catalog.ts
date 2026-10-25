// The one index the REST routes and the MCP server share, built once per server instance.
import searchDocs from '../../public/search-index.json';
import { recipes, byId, meta, humanMarkdown, buildMarkdown, domainLabel } from './recipes';
import { makeIndex, searchDetailed, type SearchDoc } from './search';

const index = makeIndex(searchDocs as SearchDoc[]);
const REQUEST_URL = 'https://github.com/Fibery-inc/process-cookbook/issues/new?labels=recipe%20request';

export function findRecipes(query: string, opts: { domain?: string; for?: string; limit?: number } = {}) {
  const { hits, mode, coverage } = searchDetailed(index, query, { ...opts, limit: Math.min(opts.limit || 5, 20) });
  // A match is a fit when every word of the query was found, or most of them were and the best hit is clear.
  const fits = hits.length > 0 && (mode === 'and' || coverage >= 0.67);
  return {
    query,
    count: hits.length,
    fits,
    match: mode === 'and' ? 'all words' : mode === 'or' ? `some words (${Math.round(coverage * 100)}% of the query)` : 'none',
    hits: hits.map((h) => ({ ...h, url: pageUrl(h.id), markdown: `${pageUrl(h.id)}.md` })),
    note: !fits
      ? `No recipe fits well${hits.length ? '; the hits below share only some words with the query' : ''}. Design from the process directly, or request a recipe at ${REQUEST_URL}`
      : undefined,
  };
}

export function getRecipe(id: string, part: 'human' | 'build' | 'all' = 'all') {
  const r = byId(id);
  if (!r) return null;
  const markdown = part === 'human' ? `# ${r.title}\n\n${r.promise}\n\n${humanMarkdown(r)}` : part === 'build' ? `# ${r.title}\n\n${buildMarkdown(r)}` : r.markdown;
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    domain: r.domain,
    for: r.for,
    version: r.version,
    updated: r.updated,
    license: r.license,
    url: pageUrl(r.id),
    source: r.github,
    part,
    markdown,
  };
}

export function listDomains() {
  return Object.entries(meta.domains)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, count]) => ({ domain, label: domainLabel(domain), count, url: `${site()}/d/${domain}` }));
}

export function site() {
  return (import.meta.env.SITE || 'https://processcookbook.org').replace(/\/$/, '');
}

export function pageUrl(id: string) {
  return `${site()}/r/${id}`;
}

export const catalogMeta = { commit: meta.commit, count: recipes.length, fetchedAt: meta.fetchedAt };

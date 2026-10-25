import MiniSearch from 'minisearch';

export type SearchDoc = {
  id: string;
  title: string;
  summary: string;
  domain: string;
  for: string;
  keywords: string[];
  version: number;
  promise: string;
  text: string;
  updated: string | null;
};

export type Hit = {
  id: string;
  title: string;
  summary: string;
  domain: string;
  for: string;
  version: number;
  updated: string | null;
  score: number;
  terms: string[];
};

export function makeIndex(docs: SearchDoc[]) {
  const index = new MiniSearch<SearchDoc>({
    fields: ['title', 'keywords', 'summary', 'promise', 'text'],
    storeFields: ['id', 'title', 'summary', 'domain', 'for', 'version', 'updated'],
    searchOptions: {
      boost: { title: 4, keywords: 3, summary: 2, promise: 1.5 },
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND',
    },
    extractField: (doc, field) => {
      const v = (doc as any)[field];
      return Array.isArray(v) ? v.join(' ') : v;
    },
  });
  index.addAll(docs);
  return index;
}

export type SearchResult = { hits: Hit[]; mode: 'and' | 'or' | 'none'; coverage: number };

const STOP = new Set(['a', 'an', 'the', 'for', 'of', 'in', 'to', 'and', 'or', 'my', 'our', 'with', 'how', 'we', 'i', 'run', 'process', 'tool']);
const tokens = (q: string) => q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));

export function searchDetailed(index: MiniSearch<SearchDoc>, query: string, opts: { domain?: string; for?: string; limit?: number } = {}): SearchResult {
  const q = query.trim();
  if (!q) return { hits: [], mode: 'none', coverage: 0 };
  let mode: 'and' | 'or' | 'none' = 'and';
  let results = index.search(q);
  if (results.length === 0) {
    mode = 'or';
    results = index.search(q, { combineWith: 'OR' });
  }
  if (results.length === 0) mode = 'none';
  const hits = toHits(results, opts);
  const asked = tokens(q);
  const top = results[0] as any;
  const matched = top && Array.isArray(top.queryTerms) ? new Set(top.queryTerms.map((t: string) => t.toLowerCase())) : new Set<string>();
  const coverage = asked.length ? asked.filter((t) => matched.has(t)).length / asked.length : 0;
  return { hits, mode, coverage: Math.round(coverage * 100) / 100 };
}

export function search(index: MiniSearch<SearchDoc>, query: string, opts: { domain?: string; for?: string; limit?: number } = {}): Hit[] {
  return searchDetailed(index, query, opts).hits;
}

function toHits(results: any[], opts: { domain?: string; for?: string; limit?: number }): Hit[] {
  const hits = results
    .filter((r) => (!opts.domain || r.domain === opts.domain) && (!opts.for || r.for === opts.for))
    .slice(0, opts.limit || 10)
    .map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      domain: r.domain,
      for: r.for,
      version: r.version,
      updated: r.updated,
      score: Math.round(r.score * 100) / 100,
      terms: r.terms,
    }));
  return hits;
}
